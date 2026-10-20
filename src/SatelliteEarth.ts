import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as AtlasMap,
} from "maplibre-gl";

/** NASA textures on MapLibre's own globe mesh projection. No second map/camera.
 * Sun direction is art-directed, not a real-time astronomical calculation.
 * Reprojection follows MapLibre's documented custom-layer shader contract.
 */
export function createSatelliteEarth(
  onState: (state: "ready" | "fallback") => void,
): CustomLayerInterface {
  let map: AtlasMap,
    vertices: WebGLBuffer | null = null,
    indices: WebGLBuffer | null = null;
  let count = 0,
    removed = false,
    loaded = false,
    failed = false,
    announced = false;
  let tick: ReturnType<typeof setInterval> | undefined;
  const programs = new globalThis.Map<string, WebGLProgram>();
  const textures: WebGLTexture[] = [];
  const clockStart = performance.now();
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const refreshMotion = () => {
    if (!removed && loaded) map.triggerRepaint();
  };
  const vertexSource = (
    data: CustomRenderMethodInput["shaderData"],
  ) => `#version 300 es
 ${data.vertexShaderPrelude}
 ${data.define}
 in vec2 a_pos;
 in vec2 a_uv;
 out highp vec2 v_uv;
 void main(){v_uv=a_uv;gl_Position=projectTile(a_pos);}`;
  const fragmentSource = `#version 300 es
 precision highp float;
 in vec2 v_uv;
 uniform sampler2D u_day;
 uniform sampler2D u_night;
 uniform sampler2D u_clouds;
 uniform vec3 u_view;
 uniform float u_time;
 uniform float u_alpha;
 out vec4 fragColor;
 const float PI=3.14159265359;
 // Smooth 3D noise avoids a visible longitude seam in the flowing effects.
 float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
 float noise(vec3 p){
   vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
   return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
              mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
 }
 void main(){
   float lon=(v_uv.x-.5)*2.0*PI;
   float lat=(.5-v_uv.y)*PI;
   vec3 normal=vec3(cos(lat)*cos(lon),cos(lat)*sin(lon),sin(lat));
   // Sun west of Africa: a legible terminator and night lights over Eurasia.
   vec3 sun=normalize(vec3(.512,-.821,.255));
   float ndl=dot(normal,sun);
   float dayWeight=smoothstep(-.11,.16,ndl);
   float diffuse=pow(max(ndl,0.0),.65);
   vec3 day=texture(u_day,v_uv).rgb;
   // Two wind scales: readable eastward drift plus gentle local billowing.
   float wind=noise(normal*8.0+vec3(u_time*.035,0.0,-u_time*.018));
   vec2 cloudUV=vec2(fract(v_uv.x+u_time*.00028+(wind-.5)*.004),
                     clamp(v_uv.y+(wind-.5)*.002*cos(lat),.001,.999));
   float cloud=pow(texture(u_clouds,cloudUV).r,1.3);
   float shadow=texture(u_clouds,cloudUV+vec2(.0025,.0015)).r;
   vec3 surface=day*(.035+1.1*diffuse)*(1.0-shadow*.32*dayWeight);
   float lights=pow(texture(u_night,v_uv).r,.72);
   surface+=vec3(1.0,.66,.28)*lights*1.8*(1.0-dayWeight)*(1.0-cloud*.65);
   // Blue ambient light retains the curvature without brightening the night side.
   surface+=vec3(.002,.009,.021)*(1.0-dayWeight);
   vec3 cloudColor=vec3(.88,.94,1.0)*(.035+.98*diffuse);
   // Ocean-only currents and wave normals; coastlines and land stay fixed.
   float ocean=smoothstep(.008,.045,day.b-max(day.r,day.g));
   float current=noise(normal*23.0+vec3(u_time*.07,-u_time*.035,u_time*.018));
   float waveA=sin(dot(normal,vec3(110.0,48.0,65.0))+u_time*.8+current*4.0);
   float waveB=sin(dot(normal,vec3(-56.0,95.0,130.0))-u_time*.62);
   vec3 east=vec3(-sin(lon),cos(lon),0.0);
   vec3 north=cross(normal,east);
   vec3 waveNormal=normalize(normal+east*waveA*.024+north*waveB*.018);
   vec3 halfway=normalize(sun+normalize(u_view));
   float glint=pow(max(dot(waveNormal,halfway),0.0),80.0)*ocean*dayWeight;
   float shimmer=pow(.5+.5*sin(current*19.0+waveA*.3),5.0);
   surface+=vec3(.025,.13,.2)*(current*.32+shimmer*.2)*ocean*dayWeight;
   surface+=vec3(.5,.68,.8)*glint*.48;
   surface=mix(surface,cloudColor,cloud*.88);
   // Slowly drifting blue scattering along the limb, with a finer outer rim.
   float facing=max(dot(normal,normalize(u_view)),0.0);
   float air=noise(normal*9.0+vec3(-u_time*.045,u_time*.025,0.0));
   float rim=pow(1.0-facing,3.8);
   surface+=vec3(.07,.25,.44)*rim*(.14+.8*dayWeight)*(.75+air*.55);
   surface+=vec3(.12,.4,.65)*pow(1.0-facing,14.0)*(.1+.3*dayWeight)*(.65+air*.6);
   fragColor=vec4(surface,u_alpha);
 }`;
  function compile(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || "Earth shader failed");
    }
    return shader;
  }
  function programFor(
    gl: WebGL2RenderingContext,
    data: CustomRenderMethodInput["shaderData"],
  ) {
    const cached = programs.get(data.variantName);
    if (cached) return cached;
    const vs = compile(gl, gl.VERTEX_SHADER, vertexSource(data)),
      fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      throw new Error("Earth program failed to link");
    }
    programs.set(data.variantName, program);
    return program;
  }
  async function texture(gl: WebGL2RenderingContext, url: string) {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (removed) return;
    const t = gl.createTexture()!;
    textures.push(t);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
  return {
    id: "satellite-earth",
    type: "custom",
    renderingMode: "2d",
    onAdd(m, context) {
      map = m;
      motion.addEventListener("change", refreshMotion);
      const gl = context as WebGL2RenderingContext;
      const points: number[] = [],
        triangles: number[] = [];
      const cols = 256,
        rows = 128;
      for (let y = 0; y <= rows; y++) {
        const lat = ((89.99 - (y / rows) * 179.98) * Math.PI) / 180;
        const my =
          (1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2;
        for (let x = 0; x <= cols; x++)
          points.push(x / cols, my, x / cols, 0.5 - lat / Math.PI);
      }
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const a = y * (cols + 1) + x,
            b = a + cols + 1;
          triangles.push(a, b, a + 1, a + 1, b, b + 1);
        }
      vertices = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
      indices = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
      gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(triangles),
        gl.STATIC_DRAW,
      );
      count = triangles.length;
      // Preserve sampler ordering; textures are small local assets.
      (async () => {
        try {
          for (const name of ["day", "night", "clouds"])
            await texture(gl, "/earth/" + name + ".jpg");
          if (removed) return;
          loaded = true;
          map.triggerRepaint();
          tick = setInterval(() => {
            if (
              !removed &&
              !failed &&
              !document.hidden &&
              !motion.matches &&
              map.getZoom() < 5.5
            )
              map.triggerRepaint();
          }, 33);
        } catch {
          if (!removed) {
            failed = true;
            onState("fallback");
          }
        }
      })();
    },
    render(context, args) {
      if (!loaded || failed || map.getZoom() >= 5.5) return;
      const gl = context as WebGL2RenderingContext;
      try {
        const p = programFor(gl, args.shaderData);
        gl.useProgram(p);
        const u = (name: string) => gl.getUniformLocation(p, name);
        const projection = args.defaultProjectionData;
        gl.uniformMatrix4fv(
          u("u_projection_matrix"),
          false,
          projection.mainMatrix,
        );
        gl.uniformMatrix4fv(
          u("u_projection_fallback_matrix"),
          false,
          projection.fallbackMatrix,
        );
        gl.uniform4fv(
          u("u_projection_tile_mercator_coords"),
          projection.tileMercatorCoords,
        );
        gl.uniform4fv(
          u("u_projection_clipping_plane"),
          projection.clippingPlane,
        );
        gl.uniform1f(
          u("u_projection_transition"),
          projection.projectionTransition,
        );
        const center = map.getCenter(),
          lat = (center.lat * Math.PI) / 180,
          lon = (center.lng * Math.PI) / 180;
        gl.uniform3f(
          u("u_view"),
          Math.cos(lat) * Math.cos(lon),
          Math.cos(lat) * Math.sin(lon),
          Math.sin(lat),
        );
        gl.uniform1f(
          u("u_time"),
          motion.matches ? 0 : (performance.now() - clockStart) / 1000,
        );
        gl.uniform1f(
          u("u_alpha"),
          Math.max(0, Math.min(1, (5.5 - map.getZoom()) / 1.3)),
        );
        for (let i = 0; i < 3; i++) {
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, textures[i]);
          gl.uniform1i(u(["u_day", "u_night", "u_clouds"][i]), i);
        }
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
        const pos = gl.getAttribLocation(p, "a_pos"),
          uv = gl.getAttribLocation(p, "a_uv");
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(uv);
        gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
        if (!announced) {
          announced = true;
          onState("ready");
        }
      } catch (e) {
        failed = true;
        onState("fallback");
        console.warn(
          "Satellite earth unavailable; atlas fallback remains active.",
          e,
        );
      }
    },
    onRemove(_m, context) {
      removed = true;
      clearInterval(tick);
      motion.removeEventListener("change", refreshMotion);
      const gl = context as WebGL2RenderingContext;
      gl.deleteBuffer(vertices);
      gl.deleteBuffer(indices);
      textures.forEach((t) => gl.deleteTexture(t));
      programs.forEach((p) => gl.deleteProgram(p));
    },
  };
}
