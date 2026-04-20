export interface ScraperResult {
  name: string;
  address: string;
  phone: string;
  website: string;
  email: string;
  instagram: string;
  linkedin: string;
  sourceText?: string;
  extractedAt: string;
}

export interface ExtractionRequest {
  url: string;
}
