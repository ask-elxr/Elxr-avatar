export type Environment = 'prod' | 'staging';

export interface NamespaceParams {
  env: Environment;
  mentor: string;
  kb: string;
  version: number;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildNamespace(params: NamespaceParams): string {
  const { env, mentor, kb, version } = params;
  
  if (!['prod', 'staging'].includes(env)) {
    throw new Error(`Invalid environment: ${env}. Must be 'prod' or 'staging'`);
  }
  
  if (!mentor || mentor.trim().length === 0) {
    throw new Error('Mentor slug is required');
  }
  
  if (!kb || kb.trim().length === 0) {
    throw new Error('Knowledge base slug is required');
  }
  
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Version must be a positive integer');
  }
  
  const mentorSlug = slugify(mentor);
  const kbSlug = slugify(kb);
  
  return `${env}:mentor:${mentorSlug}:${kbSlug}:v${version}`;
}

export function parseNamespace(namespace: string): NamespaceParams | null {
  const regex = /^(prod|staging):mentor:([a-z0-9-]+):([a-z0-9-]+):v(\d+)$/;
  const match = namespace.match(regex);
  
  if (!match) {
    return null;
  }
  
  return {
    env: match[1] as Environment,
    mentor: match[2],
    kb: match[3],
    version: parseInt(match[4], 10)
  };
}

export function validateNamespaceParams(params: Partial<NamespaceParams>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!params.env) {
    errors.push('Environment (env) is required');
  } else if (!['prod', 'staging'].includes(params.env)) {
    errors.push(`Invalid environment: ${params.env}. Must be 'prod' or 'staging'`);
  }
  
  if (!params.mentor || params.mentor.trim().length === 0) {
    errors.push('Mentor slug is required');
  }
  
  if (!params.kb || params.kb.trim().length === 0) {
    errors.push('Knowledge base slug (kb) is required');
  }
  
  if (params.version === undefined || params.version === null) {
    errors.push('Version is required');
  } else if (!Number.isInteger(params.version) || params.version < 1) {
    errors.push('Version must be a positive integer');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function buildVectorId(sourceId: string, chunkIndex: number): string {
  return `${sourceId}:${chunkIndex}`;
}

export function parseVectorId(vectorId: string): { sourceId: string; chunkIndex: number } | null {
  const lastColonIndex = vectorId.lastIndexOf(':');
  if (lastColonIndex === -1) {
    return null;
  }
  
  const sourceId = vectorId.slice(0, lastColonIndex);
  const chunkIndexStr = vectorId.slice(lastColonIndex + 1);
  const chunkIndex = parseInt(chunkIndexStr, 10);
  
  if (isNaN(chunkIndex)) {
    return null;
  }
  
  return { sourceId, chunkIndex };
}
