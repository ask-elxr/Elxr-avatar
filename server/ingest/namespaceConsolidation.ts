import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from '../logger';

const PINECONE_INDEX = 'ask-elxr';

interface ConsolidationResult {
  namespace: string;
  targetNamespace: string;
  vectorsMoved: number;
  deleted: boolean;
  error?: string;
}

interface ConsolidationSummary {
  totalNamespaces: number;
  consolidatedCount: number;
  vectorsMoved: number;
  results: ConsolidationResult[];
  errors: string[];
}

export async function listAllNamespaces(): Promise<{ name: string; count: number }[]> {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pc.index(PINECONE_INDEX);
  
  const stats = await index.describeIndexStats();
  const namespaces = stats.namespaces || {};
  
  return Object.entries(namespaces)
    .map(([name, data]) => ({
      name,
      count: data.recordCount || 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function findDuplicateNamespaces(): Promise<{ uppercase: string; lowercase: string; uppercaseCount: number; lowercaseCount: number }[]> {
  const namespaces = await listAllNamespaces();
  const duplicates: { uppercase: string; lowercase: string; uppercaseCount: number; lowercaseCount: number }[] = [];
  
  const namespaceMap = new Map(namespaces.map(ns => [ns.name, ns.count]));
  
  for (const ns of namespaces) {
    if (ns.name === ns.name.toUpperCase() && ns.name !== ns.name.toLowerCase()) {
      const lowercaseVersion = ns.name.toLowerCase();
      if (namespaceMap.has(lowercaseVersion)) {
        duplicates.push({
          uppercase: ns.name,
          lowercase: lowercaseVersion,
          uppercaseCount: ns.count,
          lowercaseCount: namespaceMap.get(lowercaseVersion) || 0
        });
      } else {
        duplicates.push({
          uppercase: ns.name,
          lowercase: lowercaseVersion,
          uppercaseCount: ns.count,
          lowercaseCount: 0
        });
      }
    }
  }
  
  return duplicates;
}

async function moveVectors(
  index: ReturnType<Pinecone['index']>,
  sourceNamespace: string,
  targetNamespace: string,
  batchSize: number = 100
): Promise<number> {
  const sourceNs = index.namespace(sourceNamespace);
  const targetNs = index.namespace(targetNamespace);
  
  let totalMoved = 0;
  let paginationToken: string | undefined;
  
  do {
    const listResult = await sourceNs.listPaginated({
      limit: batchSize,
      paginationToken
    });
    
    const vectorIds = (listResult.vectors?.map(v => v.id) || []).filter((id): id is string => id !== undefined);
    
    if (vectorIds.length === 0) break;
    
    const fetchResult = await sourceNs.fetch(vectorIds);
    const vectors = Object.values(fetchResult.records || {});
    
    if (vectors.length > 0) {
      const upsertVectors = vectors.map(v => ({
        id: v.id,
        values: v.values,
        metadata: v.metadata
      }));
      
      await targetNs.upsert(upsertVectors);
      totalMoved += vectors.length;
      
      logger.info({
        service: 'namespace-consolidation',
        sourceNamespace,
        targetNamespace,
        batchMoved: vectors.length,
        totalMoved
      }, 'Moved batch of vectors');
    }
    
    paginationToken = listResult.pagination?.next;
    
    if (paginationToken) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } while (paginationToken);
  
  return totalMoved;
}

async function deleteNamespace(
  index: ReturnType<Pinecone['index']>,
  namespace: string
): Promise<void> {
  const ns = index.namespace(namespace);
  await ns.deleteAll();
  
  logger.info({
    service: 'namespace-consolidation',
    namespace
  }, 'Deleted namespace');
}

export async function consolidateNamespaces(dryRun: boolean = true): Promise<ConsolidationSummary> {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pc.index(PINECONE_INDEX);
  
  const duplicates = await findDuplicateNamespaces();
  
  const summary: ConsolidationSummary = {
    totalNamespaces: duplicates.length,
    consolidatedCount: 0,
    vectorsMoved: 0,
    results: [],
    errors: []
  };
  
  logger.info({
    service: 'namespace-consolidation',
    dryRun,
    duplicatesFound: duplicates.length,
    duplicates: duplicates.map(d => `${d.uppercase} (${d.uppercaseCount}) → ${d.lowercase} (${d.lowercaseCount})`)
  }, 'Starting namespace consolidation');
  
  for (const dup of duplicates) {
    const result: ConsolidationResult = {
      namespace: dup.uppercase,
      targetNamespace: dup.lowercase,
      vectorsMoved: 0,
      deleted: false
    };
    
    try {
      if (dryRun) {
        result.vectorsMoved = dup.uppercaseCount;
        logger.info({
          service: 'namespace-consolidation',
          dryRun: true,
          source: dup.uppercase,
          target: dup.lowercase,
          wouldMove: dup.uppercaseCount
        }, 'Would consolidate namespace (dry run)');
      } else {
        const moved = await moveVectors(index, dup.uppercase, dup.lowercase);
        result.vectorsMoved = moved;
        summary.vectorsMoved += moved;
        
        await deleteNamespace(index, dup.uppercase);
        result.deleted = true;
        summary.consolidatedCount++;
        
        logger.info({
          service: 'namespace-consolidation',
          source: dup.uppercase,
          target: dup.lowercase,
          vectorsMoved: moved
        }, 'Consolidated namespace');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.error = errorMessage;
      summary.errors.push(`${dup.uppercase}: ${errorMessage}`);
      
      logger.error({
        service: 'namespace-consolidation',
        source: dup.uppercase,
        target: dup.lowercase,
        error: errorMessage
      }, 'Failed to consolidate namespace');
    }
    
    summary.results.push(result);
  }
  
  return summary;
}
