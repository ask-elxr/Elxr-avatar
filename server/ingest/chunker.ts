const CHUNK_TOKENS = parseInt(process.env.CHUNK_TOKENS || '350');
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP || '60');
const APPROX_CHARS_PER_TOKEN = 4;

export interface ChunkMetadata {
  mentor: string;
  kb: string;
  title: string;
  section: string;
  chunk_index: number;
  text_preview: string;
}

export interface Chunk {
  text: string;
  textWithBreadcrumb: string;
  metadata: ChunkMetadata;
}

export interface ChunkOptions {
  title: string;
  mentor: string;
  kb: string;
  chunkTokens?: number;
  chunkOverlap?: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface Section {
  heading: string;
  content: string;
}

function splitByHeadings(text: string): Section[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const sections: Section[] = [];
  let lastIndex = 0;
  let currentHeading = 'Introduction';
  
  const matches = Array.from(text.matchAll(headingRegex));
  
  if (matches.length === 0) {
    return [{ heading: 'Content', content: text }];
  }
  
  for (const match of matches) {
    const beforeHeading = text.slice(lastIndex, match.index).trim();
    if (beforeHeading) {
      sections.push({ heading: currentHeading, content: beforeHeading });
    }
    currentHeading = match[2].trim();
    lastIndex = (match.index || 0) + match[0].length;
  }
  
  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    sections.push({ heading: currentHeading, content: remaining });
  }
  
  return sections;
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

function createBreadcrumb(title: string, section: string, mentor: string, kb: string): string {
  return `Title: ${title}\nSection: ${section}\nMentor: ${mentor}\nKB: ${kb}\nContent: `;
}

function chunkText(
  text: string,
  section: string,
  options: ChunkOptions,
  startIndex: number
): Chunk[] {
  const { title, mentor, kb, chunkTokens = CHUNK_TOKENS, chunkOverlap = CHUNK_OVERLAP } = options;
  const chunks: Chunk[] = [];
  
  const maxChunkChars = chunkTokens * APPROX_CHARS_PER_TOKEN;
  const overlapChars = chunkOverlap * APPROX_CHARS_PER_TOKEN;
  
  const paragraphs = splitIntoParagraphs(text);
  let currentChunk = '';
  let chunkIndex = startIndex;
  
  for (const paragraph of paragraphs) {
    if (estimateTokens(currentChunk + '\n\n' + paragraph) > chunkTokens) {
      if (currentChunk.trim()) {
        const breadcrumb = createBreadcrumb(title, section, mentor, kb);
        const trimmedChunk = currentChunk.trim();
        chunks.push({
          text: trimmedChunk,
          textWithBreadcrumb: breadcrumb + trimmedChunk,
          metadata: {
            mentor,
            kb,
            title,
            section,
            chunk_index: chunkIndex,
            text_preview: trimmedChunk.slice(0, 200)
          }
        });
        chunkIndex++;
        
        const words = currentChunk.split(/\s+/);
        const overlapWords = Math.ceil(words.length * (chunkOverlap / chunkTokens));
        currentChunk = words.slice(-overlapWords).join(' ');
      }
    }
    currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
  }
  
  if (currentChunk.trim()) {
    const breadcrumb = createBreadcrumb(title, section, mentor, kb);
    const trimmedChunk = currentChunk.trim();
    chunks.push({
      text: trimmedChunk,
      textWithBreadcrumb: breadcrumb + trimmedChunk,
      metadata: {
        mentor,
        kb,
        title,
        section,
        chunk_index: chunkIndex,
        text_preview: trimmedChunk.slice(0, 200)
      }
    });
  }
  
  return chunks;
}

function chunkLongText(
  text: string,
  section: string,
  options: ChunkOptions,
  startIndex: number
): Chunk[] {
  const { title, mentor, kb, chunkTokens = CHUNK_TOKENS, chunkOverlap = CHUNK_OVERLAP } = options;
  const chunks: Chunk[] = [];
  const maxChunkChars = chunkTokens * APPROX_CHARS_PER_TOKEN;
  const overlapChars = chunkOverlap * APPROX_CHARS_PER_TOKEN;
  
  let position = 0;
  let chunkIndex = startIndex;
  
  while (position < text.length) {
    let endPosition = Math.min(position + maxChunkChars, text.length);
    
    if (endPosition < text.length) {
      const sentenceEnd = text.lastIndexOf('. ', endPosition);
      if (sentenceEnd > position + maxChunkChars / 2) {
        endPosition = sentenceEnd + 1;
      }
    }
    
    const chunkText = text.slice(position, endPosition).trim();
    if (chunkText) {
      const breadcrumb = createBreadcrumb(title, section, mentor, kb);
      chunks.push({
        text: chunkText,
        textWithBreadcrumb: breadcrumb + chunkText,
        metadata: {
          mentor,
          kb,
          title,
          section,
          chunk_index: chunkIndex,
          text_preview: chunkText.slice(0, 200)
        }
      });
      chunkIndex++;
    }
    
    position = Math.max(position + 1, endPosition - overlapChars);
  }
  
  return chunks;
}

export function chunkDocument(text: string, options: ChunkOptions): Chunk[] {
  const { chunkTokens = CHUNK_TOKENS } = options;
  const normalizedText = normalizeWhitespace(text);
  const sections = splitByHeadings(normalizedText);
  
  const allChunks: Chunk[] = [];
  let globalChunkIndex = 0;
  
  for (const section of sections) {
    if (!section.content.trim()) continue;
    
    const sectionTokens = estimateTokens(section.content);
    
    let sectionChunks: Chunk[];
    if (sectionTokens <= chunkTokens * 1.2) {
      const breadcrumb = createBreadcrumb(options.title, section.heading, options.mentor, options.kb);
      const trimmedContent = section.content.trim();
      sectionChunks = [{
        text: trimmedContent,
        textWithBreadcrumb: breadcrumb + trimmedContent,
        metadata: {
          mentor: options.mentor,
          kb: options.kb,
          title: options.title,
          section: section.heading,
          chunk_index: globalChunkIndex,
          text_preview: trimmedContent.slice(0, 200)
        }
      }];
    } else if (section.content.includes('\n\n')) {
      sectionChunks = chunkText(section.content, section.heading, options, globalChunkIndex);
    } else {
      sectionChunks = chunkLongText(section.content, section.heading, options, globalChunkIndex);
    }
    
    allChunks.push(...sectionChunks);
    globalChunkIndex += sectionChunks.length;
  }
  
  return allChunks;
}

export function getDryRunPreview(text: string, options: ChunkOptions): {
  chunks: Array<{ section: string; chunk_index: number; token_estimate: number; preview: string }>;
  totalChunks: number;
  totalTokensEstimate: number;
} {
  const chunks = chunkDocument(text, options);
  
  const preview = chunks.map(chunk => ({
    section: chunk.metadata.section,
    chunk_index: chunk.metadata.chunk_index,
    token_estimate: estimateTokens(chunk.textWithBreadcrumb),
    preview: chunk.metadata.text_preview
  }));
  
  const totalTokens = chunks.reduce((sum, c) => sum + estimateTokens(c.textWithBreadcrumb), 0);
  
  return {
    chunks: preview,
    totalChunks: chunks.length,
    totalTokensEstimate: totalTokens
  };
}
