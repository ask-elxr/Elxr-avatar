import { Client } from '@notionhq/client';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from './logger';
import { storage } from './storage';

interface NotionPage {
  id: string;
  title: string;
  content: string;
  url: string;
  lastEditedTime: string;
}

export class NotionService {
  private notion?: Client;
  private openai?: OpenAI;
  private pinecone?: Pinecone;

  constructor() {
    const notionKey = process.env.NOTION_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const pineconeKey = process.env.PINECONE_API_KEY;

    if (notionKey) {
      this.notion = new Client({ auth: notionKey });
    } else {
      logger.warn('NOTION_API_KEY not found - Notion integration disabled');
    }

    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }

    if (pineconeKey) {
      this.pinecone = new Pinecone({ apiKey: pineconeKey });
    }
  }

  async syncDatabaseToNamespace(
    databaseId: string,
    namespace: string,
    knowledgeSourceId: string,
    userId: string
  ): Promise<{ success: boolean; itemsCount?: number; error?: string }> {
    if (!this.notion || !this.openai || !this.pinecone) {
      return { success: false, error: 'Services not configured' };
    }

    const log = logger.child({
      service: 'notion',
      operation: 'syncDatabaseToNamespace',
      databaseId,
      namespace
    });

    try {
      log.info('Starting Notion sync');

      // Update status to syncing
      await storage.updateKnowledgeSource(knowledgeSourceId, userId, {
        status: 'syncing',
        syncError: null
      });

      // Fetch pages from Notion database
      const pages = await this.fetchPagesFromDatabase(databaseId);
      log.info({ pageCount: pages.length }, 'Fetched pages from Notion');

      if (pages.length === 0) {
        await storage.updateKnowledgeSource(knowledgeSourceId, userId, {
          status: 'active',
          lastSyncAt: new Date(),
          itemsCount: 0
        });
        return { success: true, itemsCount: 0 };
      }

      // Generate embeddings and upsert to Pinecone
      const index = this.pinecone.index('ask-elxr');
      const vectors = [];

      for (const page of pages) {
        // Generate embedding
        const embeddingResponse = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: `${page.title}\n\n${page.content}`
        });

        const embedding = embeddingResponse.data[0].embedding;

        vectors.push({
          id: `notion-${page.id}`,
          values: embedding,
          metadata: {
            source: 'notion',
            title: page.title,
            text: page.content.substring(0, 2000), // Limit metadata size
            url: page.url,
            lastEditedTime: page.lastEditedTime,
            userId
          }
        });
      }

      // Upsert to Pinecone namespace
      await index.namespace(namespace).upsert(vectors);

      log.info({ vectorCount: vectors.length }, 'Upserted vectors to Pinecone');

      // Update knowledge source status
      await storage.updateKnowledgeSource(knowledgeSourceId, userId, {
        status: 'active',
        lastSyncAt: new Date(),
        itemsCount: pages.length,
        syncError: null
      });

      return { success: true, itemsCount: pages.length };
    } catch (error: any) {
      log.error({ error: error.message }, 'Notion sync failed');
      
      await storage.updateKnowledgeSource(knowledgeSourceId, userId, {
        status: 'error',
        syncError: error.message
      });

      return { success: false, error: error.message };
    }
  }

  private async fetchPagesFromDatabase(databaseId: string): Promise<NotionPage[]> {
    if (!this.notion) throw new Error('Notion client not initialized');

    const pages: NotionPage[] = [];
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const queryParams: any = {
        database_id: databaseId,
      };
      if (startCursor) {
        queryParams.start_cursor = startCursor;
      }
      
      const response: any = await (this.notion as any).databases.query(queryParams);

      for (const page of response.results) {
        const pageContent = await this.getPageContent(page.id);
        const title = this.extractTitle(page);
        
        pages.push({
          id: page.id,
          title,
          content: pageContent,
          url: page.url || '',
          lastEditedTime: page.last_edited_time
        });
      }

      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }

    return pages;
  }

  private async getPageContent(pageId: string): Promise<string> {
    if (!this.notion) throw new Error('Notion client not initialized');

    const blocks: any = await this.notion.blocks.children.list({
      block_id: pageId
    });

    let content = '';

    for (const block of blocks.results) {
      content += this.extractBlockText(block) + '\n';
    }

    return content.trim();
  }

  private extractTitle(page: any): string {
    // Extract title from page properties
    const titleProperty = Object.values(page.properties).find(
      (prop: any) => prop.type === 'title'
    ) as any;

    if (titleProperty && titleProperty.title && titleProperty.title.length > 0) {
      return titleProperty.title[0].plain_text;
    }

    return 'Untitled';
  }

  private extractBlockText(block: any): string {
    const type = block.type;
    
    if (!block[type]) return '';

    const richText = block[type].rich_text;
    if (!richText || richText.length === 0) return '';

    return richText.map((text: any) => text.plain_text).join('');
  }
}

export const notionService = new NotionService();
