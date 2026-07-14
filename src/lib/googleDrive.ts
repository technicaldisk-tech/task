/**
 * Google Drive Workspace Integration Helper
 */

/**
 * Searches for a folder by name, nested under a given parent folder if specified.
 * If not found, creates the folder and marks it shareable.
 */
export async function getOrCreateFolder(
  token: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  const cleanName = folderName.replace(/'/g, "\\'");
  let query = `name = '${cleanName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id; // Re-use folder
      }
    }
  } catch (err) {
    console.error('Error finding Google Drive folder, trying to create instead:', err);
  }

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create Google Drive folder "${folderName}": ${errText}`);
  }

  const createData = await createRes.json();
  const folderId = createData.id;

  // Make folder shareable so others can view files inside
  try {
    const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });
    if (!permRes.ok) {
      const errText = await permRes.text();
      console.error(`Failed to set view permissions on folder "${folderName}" (Status ${permRes.status}):`, errText);
    } else {
      console.log(`Successfully verified and set "anyone can view" permissions for folder "${folderName}".`);
    }
  } catch (permError) {
    console.error(`Failed to set view permissions on folder "${folderName}":`, permError);
  }

  return folderId;
}

/**
 * Uploads a raw File to Google Drive inside a parent folder using Multipart.
 * Then grants read access to anyone with the link, returning the Web View Link.
 */
export async function uploadFileToDrive(
  token: string,
  file: File,
  parentId?: string,
  customName?: string,
  onProgress?: (progressStr: string) => void
): Promise<{ id: string; webViewLink: string }> {
  // Initiate the resumable session
  const initiateRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        name: customName || file.name,
        parents: parentId ? [parentId] : undefined,
      }),
    }
  );

  if (!initiateRes.ok) {
    const errText = await initiateRes.text();
    throw new Error(`Failed to initiate Google Drive upload session: ${initiateRes.status} - ${errText}`);
  }

  const uploadUrl = initiateRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('Google Drive did not provide a Resumable Session Location upload URL.');
  }

  // Upload the binary file directly via PUT using XMLHttpRequest to track live upload progress
  const finalResponseData = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(`${percent}%`);
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse Google Drive response JSON: ${xhr.responseText}`));
        }
      } else {
        reject(new Error(`Google Drive Resumable Upload failed: ${xhr.status} - ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Google Drive upload network error.'));
    };

    xhr.send(file);
  });

  const fileId = finalResponseData.id;

  // Set permission to anyone with link can view (reader)
  try {
    const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });
    if (!permRes.ok) {
      const errText = await permRes.text();
      console.error(`Failed to set view permissions on uploaded file "${file.name}" (Status ${permRes.status}):`, errText);
    } else {
      console.log(`Successfully verified and set "anyone can view" permissions for file "${file.name}".`);
    }
  } catch (permError) {
    console.error(`Failed to set view permissions on uploaded file "${file.name}":`, permError);
  }

  return {
    id: fileId,
    webViewLink: finalResponseData.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
  };
}
