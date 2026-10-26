export function hotelShareUrl(hotelId: string, currentUrl: string): string {
  const url = new URL(currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("hotel", hotelId);
  return url.toString();
}

export function sharedHotelId(search: string): string | null {
  const id = new URLSearchParams(search).get("hotel");
  // Treat the value only as an ID. The caller resolves it against the collection.
  return id && id.trim() ? id : null;
}
