import { google } from 'googleapis';
import { logger } from './logger';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-drive',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Drive not connected');
  }
  return accessToken;
}

async function getUncachableGoogleDriveClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export class GoogleDriveService {
  private log = logger.child({ service: 'google-drive' });

  async listSharedFolders(pageToken?: string) {
    try {
      this.log.info('Listing shared folders from Google Drive');
      const drive = await getUncachableGoogleDriveClient();

      const response = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and sharedWithMe=true",
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, iconLink, webViewLink)',
        pageSize: 50,
        pageToken: pageToken,
        orderBy: 'modifiedTime desc'
      });

      return {
        folders: response.data.files || [],
        nextPageToken: response.data.nextPageToken
      };
    } catch (error: any) {
      this.log.error({ error: error.message }, 'Failed to list shared folders');
      throw new Error('Failed to access Google Drive shared folders');
    }
  }

  async listFolderContents(folderId: string, pageToken?: string) {
    try {
      this.log.info({ folderId }, 'Listing folder contents');
      const drive = await getUncachableGoogleDriveClient();

      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, iconLink, webViewLink)',
        pageSize: 100,
        pageToken: pageToken,
        orderBy: 'folder,name'
      });

      return {
        files: response.data.files || [],
        nextPageToken: response.data.nextPageToken
      };
    } catch (error: any) {
      this.log.error({ error: error.message, folderId }, 'Failed to list folder contents');
      throw new Error('Failed to list folder contents');
    }
  }

  async downloadFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    try {
      this.log.info({ fileId }, 'Downloading file from Google Drive');
      const drive = await getUncachableGoogleDriveClient();

      // Get file metadata first
      const metadata = await drive.files.get({
        fileId: fileId,
        fields: 'name, mimeType, size'
      });

      const fileName = metadata.data.name || 'unknown';
      const mimeType = metadata.data.mimeType || 'application/octet-stream';

      this.log.info({ fileId, fileName, mimeType }, 'File metadata retrieved');

      // Handle Google Docs formats - export as PDF or plain text
      if (mimeType.startsWith('application/vnd.google-apps.')) {
        let exportMimeType = 'application/pdf';
        
        if (mimeType === 'application/vnd.google-apps.document') {
          exportMimeType = 'application/pdf';
        } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
          exportMimeType = 'application/pdf';
        } else if (mimeType === 'application/vnd.google-apps.presentation') {
          exportMimeType = 'application/pdf';
        }

        this.log.info({ fileId, exportMimeType }, 'Exporting Google Docs file');
        
        const response = await drive.files.export({
          fileId: fileId,
          mimeType: exportMimeType
        }, {
          responseType: 'arraybuffer'
        });

        return {
          buffer: Buffer.from(response.data as ArrayBuffer),
          mimeType: exportMimeType,
          fileName: fileName.replace(/\.[^/.]+$/, '') + '.pdf'
        };
      }

      // Regular file download
      const response = await drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, {
        responseType: 'arraybuffer'
      });

      return {
        buffer: Buffer.from(response.data as ArrayBuffer),
        mimeType: mimeType,
        fileName: fileName
      };
    } catch (error: any) {
      this.log.error({ error: error.message, fileId }, 'Failed to download file');
      throw new Error('Failed to download file from Google Drive');
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      await getAccessToken();
      return true;
    } catch (error) {
      return false;
    }
  }

  async searchFiles(query: string, pageToken?: string) {
    try {
      this.log.info({ query }, 'Searching Google Drive files');
      const drive = await getUncachableGoogleDriveClient();

      // Search for files matching the query in shared folders only
      // Using fullText for content search and name for file name search
      // sharedWithMe=true ensures we only search files that have been shared with this account
      const escapedQuery = query.replace(/'/g, "\\'");
      const searchQuery = `(fullText contains '${escapedQuery}' or name contains '${escapedQuery}') and sharedWithMe=true and trashed=false`;
      
      const response = await drive.files.list({
        q: searchQuery,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, iconLink, webViewLink, parents)',
        pageSize: 50,
        pageToken: pageToken,
        orderBy: 'modifiedTime desc'
      });

      return {
        files: response.data.files || [],
        nextPageToken: response.data.nextPageToken
      };
    } catch (error: any) {
      this.log.error({ error: error.message, query }, 'Failed to search Google Drive');
      throw new Error('Failed to search Google Drive');
    }
  }

  // List all files recursively in a folder (with optional depth limit)
  async listAllFilesRecursive(folderId: string, maxDepth: number = 3, currentDepth: number = 0): Promise<any[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    const allFiles: any[] = [];
    let pageToken: string | undefined;

    do {
      const result = await this.listFolderContents(folderId, pageToken);
      
      for (const file of result.files) {
        if (!file.id) continue;
        
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Recursively get files from subfolders
          const subFiles = await this.listAllFilesRecursive(file.id, maxDepth, currentDepth + 1);
          allFiles.push(...subFiles.map(f => ({ ...f, parentFolder: file.name || 'Unknown' })));
        } else {
          allFiles.push({ ...file, parentFolder: undefined });
        }
      }

      pageToken = result.nextPageToken || undefined;
    } while (pageToken);

    return allFiles;
  }

  // Get all folders with their file counts
  async getFolderStats(): Promise<{ folderId: string; folderName: string; fileCount: number; supportedFiles: number }[]> {
    const stats: { folderId: string; folderName: string; fileCount: number; supportedFiles: number }[] = [];
    const supportedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/vnd.google-apps.document' // Google Docs (will be exported as PDF)
    ];

    try {
      const { folders } = await this.listSharedFolders();
      
      for (const folder of folders) {
        if (!folder.id) continue;
        
        const files = await this.listAllFilesRecursive(folder.id, 2);
        const supportedFiles = files.filter(f => 
          supportedMimeTypes.includes(f.mimeType) || 
          f.name?.endsWith('.pdf') || 
          f.name?.endsWith('.docx') || 
          f.name?.endsWith('.txt')
        );
        
        stats.push({
          folderId: folder.id,
          folderName: folder.name || 'Unknown',
          fileCount: files.length,
          supportedFiles: supportedFiles.length
        });
      }
    } catch (error: any) {
      this.log.error({ error: error.message }, 'Failed to get folder stats');
    }

    return stats;
  }
}

export const googleDriveService = new GoogleDriveService();
