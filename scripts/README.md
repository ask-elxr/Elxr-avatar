# PubMed Offline Import Tool

This script imports PubMed XML dump files into Pinecone for offline searching.

## Prerequisites

1. **Environment Variables**:
   - `OPENAI_API_KEY`: For generating embeddings
   - `PINECONE_API_KEY`: For storing article vectors

2. **PubMed XML Dump Files**:
   Download from: `ftp://ftp.ncbi.nlm.nih.gov/pubmed/baseline/`
   
   Files are named: `pubmed24n0001.xml.gz` through `pubmed24n1219.xml.gz`

## Usage

### Import a single file

```bash
tsx scripts/importPubMedDump.ts data/pubmed24n0001.xml.gz
```

### Resume interrupted import

If the import is interrupted, you can resume from where it left off:

```bash
tsx scripts/importPubMedDump.ts data/pubmed24n0001.xml.gz --resume
```

### Start fresh (ignore previous progress)

```bash
tsx scripts/importPubMedDump.ts data/pubmed24n0001.xml.gz --reset
```

## How it works

1. **Stream Parse XML**: Uses streaming XML parser to process large files without loading entire file into memory
2. **Extract metadata**: Pulls PMID, title, abstract, authors, journal, year, keywords from each article
3. **Generate embeddings**: Creates vector embeddings using OpenAI's `text-embedding-ada-002`
4. **Batch storage**: Stores 100 articles at a time in Pinecone namespace `pubmed-offline`
5. **Progress tracking**: Saves progress to `pubmed-import-progress.json` for resumability

### Memory efficiency

The import script uses a streaming XML parser (`node-xml-stream`) that processes one article at a time. This keeps memory usage bounded regardless of file size, allowing you to import multi-gigabyte PubMed dump files on machines with limited RAM.

## Processing batches

The script processes articles in batches:
- **Parse batch**: 1000 articles extracted from XML at a time
- **Storage batch**: 100 vectors upserted to Pinecone at a time

This ensures efficient memory usage and resumability.

## Progress tracking

Progress is automatically saved to `pubmed-import-progress.json`:

```json
{
  "currentFile": "data/pubmed24n0001.xml.gz",
  "processedFiles": [],
  "lastProcessedPMID": "12345678",
  "totalArticlesProcessed": 5000,
  "totalSuccessCount": 4950,
  "totalErrorCount": 50,
  "startTime": 1234567890
}
```

## Performance

- **Speed**: ~1000 articles per minute (depends on OpenAI API rate limits)
- **File size**: Each .xml.gz file is 15-20 MB compressed, ~100-150 MB uncompressed
- **Articles per file**: ~30,000 articles
- **Time per file**: ~30-45 minutes

## Error handling

- Errors are logged but don't stop the import
- Progress is saved after each batch
- Use `--resume` to continue from last successful PMID

## Cost estimation

For OpenAI embeddings (text-embedding-ada-002):
- Cost: $0.0001 per 1K tokens
- Average article: ~200 tokens (title + abstract + keywords)
- **Estimated cost per file**: $0.60 (30,000 articles × 200 tokens / 1000 × $0.0001)
- **Full baseline (1219 files)**: ~$730

## Tips

1. **Download files**: Use `wget` or `curl` to download PubMed baseline files
   ```bash
   wget ftp://ftp.ncbi.nlm.nih.gov/pubmed/baseline/pubmed24n0001.xml.gz
   ```

2. **Verify checksums**: Each file has a corresponding `.md5` file
   ```bash
   md5sum -c pubmed24n0001.xml.gz.md5
   ```

3. **Process sequentially**: Process files in order (n0001, n0002, etc.)

4. **Monitor progress**: Check `pubmed-import-progress.json` for status

5. **Disk space**: Ensure sufficient space (~20 GB for uncompressed files)

## Querying offline data

After import, use the `/api/pubmed/offline-search` endpoint:

```bash
curl -X POST http://localhost:5000/api/pubmed/offline-search \
  -H "Content-Type: application/json" \
  -d '{"query": "vitamin D immune system", "maxResults": 10}'
```

## Troubleshooting

### Import fails with OpenAI rate limit
- OpenAI has rate limits (3500 RPM for tier 1)
- The script uses circuit breakers to handle this
- Wait a few seconds and use `--resume` to continue

### Out of memory
- Reduce `BATCH_SIZE` in the script (default: 1000)
- Close other applications
- Use a machine with more RAM

### Pinecone errors
- Verify `PINECONE_API_KEY` is correct
- Check Pinecone index exists (name: `ask-elxr`)
- Ensure namespace `pubmed-offline` is available
