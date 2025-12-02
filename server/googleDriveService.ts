import { google } from 'googleapis';
import { logger } from './logger';
import { GOOGLE_DRIVE_SOURCE_FOLDER_ID, getFolderNamespace, PineconeCategory } from '../shared/pineconeCategories';

export interface TopicFolder {
  id: string;
  name: string;
  namespace: PineconeCategory;
  fileCount: number;
  supportedFiles: number;
}

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

  // List all Shared Drives (Team Drives) the user has access to
  async listSharedDrives(pageToken?: string) {
    try {
      this.log.info('Listing Shared Drives from Google Drive');
      const drive = await getUncachableGoogleDriveClient();

      const response = await drive.drives.list({
        pageSize: 50,
        pageToken: pageToken,
        fields: 'nextPageToken, drives(id, name, createdTime)'
      });

      return {
        drives: response.data.drives || [],
        nextPageToken: response.data.nextPageToken
      };
    } catch (error: any) {
      this.log.error({ error: error.message }, 'Failed to list Shared Drives');
      // Return empty array if no access to shared drives (personal accounts)
      return { drives: [], nextPageToken: undefined };
    }
  }

  // List folders in a specific Shared Drive
  async listSharedDriveFolders(driveId: string, pageToken?: string) {
    try {
      this.log.info({ driveId }, 'Listing folders in Shared Drive');
      const drive = await getUncachableGoogleDriveClient();

      const response = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and '${driveId}' in parents and trashed=false`,
        corpora: 'drive',
        driveId: driveId,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, iconLink, webViewLink)',
        pageSize: 50,
        pageToken: pageToken,
        orderBy: 'name'
      });

      return {
        folders: response.data.files || [],
        nextPageToken: response.data.nextPageToken
      };
    } catch (error: any) {
      this.log.error({ error: error.message, driveId }, 'Failed to list Shared Drive folders');
      throw new Error('Failed to list Shared Drive folders');
    }
  }

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

  async listFolderContents(folderId: string, pageToken?: string, driveId?: string) {
    try {
      this.log.info({ folderId, driveId }, 'Listing folder contents');
      const drive = await getUncachableGoogleDriveClient();

      // Build the request options
      const requestOptions: any = {
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, iconLink, webViewLink)',
        pageSize: 100,
        pageToken: pageToken,
        orderBy: 'folder,name',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      };

      // If we're in a Shared Drive, set the corpora and driveId for proper access
      if (driveId) {
        requestOptions.corpora = 'drive';
        requestOptions.driveId = driveId;
      }

      const response = await drive.files.list(requestOptions);

      return {
        files: response.data.files || [],
        nextPageToken: response.data.nextPageToken
      };
    } catch (error: any) {
      this.log.error({ error: error.message, folderId, driveId }, 'Failed to list folder contents');
      throw new Error('Failed to list folder contents');
    }
  }

  async downloadFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    try {
      this.log.info({ fileId }, 'Downloading file from Google Drive');
      const drive = await getUncachableGoogleDriveClient();

      // Get file metadata first (with Shared Drives support)
      const metadata = await drive.files.get({
        fileId: fileId,
        fields: 'name, mimeType, size',
        supportsAllDrives: true
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

      // Regular file download (with Shared Drives support)
      const response = await drive.files.get({
        fileId: fileId,
        alt: 'media',
        supportsAllDrives: true
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

      // Search for files matching the query across all accessible drives
      // Using fullText for content search and name for file name search
      // Search in both shared files and shared drives
      const escapedQuery = query.replace(/'/g, "\\'");
      const searchQuery = `(fullText contains '${escapedQuery}' or name contains '${escapedQuery}') and trashed=false`;
      
      const response = await drive.files.list({
        q: searchQuery,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, iconLink, webViewLink, parents, driveId)',
        pageSize: 50,
        pageToken: pageToken,
        orderBy: 'modifiedTime desc',
        corpora: 'allDrives',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
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

  async getTopicFolders(): Promise<TopicFolder[]> {
    try {
      this.log.info({ sourceFolderId: GOOGLE_DRIVE_SOURCE_FOLDER_ID }, 'Getting topic folders from source');
      
      const { files } = await this.listFolderContents(GOOGLE_DRIVE_SOURCE_FOLDER_ID);
      
      const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
      
      const supportedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/vnd.google-apps.document'
      ];
      
      // Exclude zip files and archives
      const excludedMimeTypes = [
        'application/zip',
        'application/x-zip-compressed',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        'application/gzip'
      ];
      
      // Max file size: 3MB
      const maxFileSize = 3 * 1024 * 1024;
      
      const topicFolders: TopicFolder[] = [];
      
      for (const folder of folders) {
        if (!folder.id || !folder.name) continue;
        
        const namespace = getFolderNamespace(folder.name);
        
        const { files: folderFiles } = await this.listFolderContents(folder.id);
        
        // Filter to only uploadable files (no zips, no large files)
        const uploadableFiles = folderFiles.filter(f => {
          // Skip folders
          if (f.mimeType === 'application/vnd.google-apps.folder') return false;
          // Skip archives
          if (excludedMimeTypes.includes(f.mimeType || '')) return false;
          if (f.name?.endsWith('.zip') || f.name?.endsWith('.rar') || f.name?.endsWith('.7z')) return false;
          // Skip large files
          const fileSize = parseInt(f.size || '0', 10);
          if (fileSize > maxFileSize) return false;
          // Check if supported type
          return supportedMimeTypes.includes(f.mimeType || '') || 
            f.name?.endsWith('.pdf') || 
            f.name?.endsWith('.docx') || 
            f.name?.endsWith('.txt');
        });
        
        topicFolders.push({
          id: folder.id,
          name: folder.name,
          namespace,
          fileCount: folderFiles.length,
          supportedFiles: uploadableFiles.length
        });
      }
      
      this.log.info({ folderCount: topicFolders.length }, 'Topic folders retrieved');
      return topicFolders;
    } catch (error: any) {
      this.log.error({ error: error.message }, 'Failed to get topic folders');
      throw new Error('Failed to get topic folders from Google Drive');
    }
  }

  async getFilesInTopicFolder(folderId: string): Promise<any[]> {
    const supportedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/vnd.google-apps.document'
    ];
    
    // Exclude zip files and other archive types
    const excludedMimeTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/gzip'
    ];
    
    // Max file size: 3MB (to ensure memory safety)
    const maxFileSize = 3 * 1024 * 1024;
    
    const allFiles: any[] = [];
    let pageToken: string | undefined;
    
    do {
      const result = await this.listFolderContents(folderId, pageToken);
      
      for (const file of result.files) {
        if (!file.id) continue;
        
        // Skip folders
        if (file.mimeType === 'application/vnd.google-apps.folder') continue;
        
        // Skip excluded types (zip, rar, etc.)
        if (excludedMimeTypes.includes(file.mimeType || '')) continue;
        if (file.name?.endsWith('.zip') || file.name?.endsWith('.rar') || file.name?.endsWith('.7z')) continue;
        
        // Check file size if available
        const fileSize = parseInt(file.size || '0', 10);
        if (fileSize > maxFileSize) {
          this.log.debug({ fileName: file.name, fileSize }, 'Skipping large file');
          continue;
        }
        
        const isSupportedFile = supportedMimeTypes.includes(file.mimeType || '') || 
          file.name?.endsWith('.pdf') || 
          file.name?.endsWith('.docx') || 
          file.name?.endsWith('.txt');
        
        if (isSupportedFile) {
          allFiles.push(file);
        }
      }
      
      pageToken = result.nextPageToken || undefined;
    } while (pageToken);
    
    return allFiles;
  }
}

export const googleDriveService = new GoogleDriveService();
