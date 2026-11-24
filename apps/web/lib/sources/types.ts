export interface FetchedItem {
  title: string;
  url: string;
  publishedAt: Date | null;
  summary: string | null;
  imageUrl?: string | null;
  fullBody?: string;
}

export interface FetchResult {
  sourceId: string;
  items: FetchedItem[];
  error: string | null;
}
