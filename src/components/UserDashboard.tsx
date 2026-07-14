import React, { useState, useEffect } from 'react';
import { getOrCreateFolder, uploadFileToDrive } from '../lib/googleDrive';
import { Task, UploadedFile } from '../types';
import { 
  Briefcase, CheckCircle2, Clock, Landmark, FileText, 
  UploadCloud, ExternalLink, Download, ArrowRight, LogOut, Loader2, RefreshCw,
  Copy, Check, Share2, Timer, Search, Calendar, ChevronDown,
  X, Lock, Link
} from 'lucide-react';
import { googleSignIn, logout as googleDriveLogout } from '../lib/firebaseAuth';

interface UserDashboardProps {
  user: { userId: string; name: string };
  onLogout: () => void;
}

function getFileViewUrl(file: { path: string; driveUrl?: string }) {
  if (file.driveUrl && file.driveUrl.startsWith('https://drive.google.com')) {
    return file.driveUrl.replace('/view', '/preview');
  }
  return file.path;
}

// Client-side chunked upload helper to bypass serverless & reverse-proxy file size limits
async function uploadFileInChunks(
  file: File,
  taskId: string,
  type: 'sample' | 'final',
  uploadedBy: 'Admin' | 'User',
  clientName: string,
  uploaderName: string,
  onProgress: (progressStr: string) => void,
  customName?: string
): Promise<any> {
  const chunkSize = 5 * 1024 * 1024; // 5 MB chunks
  const totalChunks = Math.ceil(file.size / chunkSize);
  const uploadId = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  for (let chunkNumber = 1; chunkNumber <= totalChunks; chunkNumber++) {
    const start = (chunkNumber - 1) * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunkBlob = file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunkBlob, customName || file.name);
    formData.append('uploadId', uploadId);
    formData.append('chunkNumber', chunkNumber.toString());
    formData.append('totalChunks', totalChunks.toString());
    formData.append('fileName', customName || file.name);
    formData.append('taskId', taskId);
    formData.append('type', type);
    formData.append('uploadedBy', uploadedBy);
    formData.append('clientName', clientName);
    formData.append('uploaderName', uploaderName);

    onProgress(`${Math.round(((chunkNumber - 1) / totalChunks) * 100)}% (${chunkNumber}/${totalChunks})`);

    const response = await fetch(`/api/upload/chunk?type=${type}&clientName=${encodeURIComponent(clientName)}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `Chunk upload failed at part ${chunkNumber}/${totalChunks}`);
    }

    const data = await response.json();
    if (chunkNumber === totalChunks) {
      if (!data.success) {
        throw new Error(data.message || "Failed to finalize merged file on server.");
      }
      return data; // contains { success: true, task: ... }
    }
  }
}

const formatDateToYYYYMMDD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDDMMYYYY = (str: string) => {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) {
    const dotParts = str.split('.');
    if (dotParts.length === 3) {
      return new Date(parseInt(dotParts[2]), parseInt(dotParts[1]) - 1, parseInt(dotParts[0]));
    }
    return null;
  }
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
};

const formatHumanDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  return `${months[monthIdx]} ${day}, ${year}`;
};

const PRESET_OPTIONS = [
  'Today',
  'Yesterday',
  'Maximum',
  'Today and yesterday',
  'Last 7 days',
  'Last 14 days',
  'Last 28 days',
  'Last 30 days',
  'This week',
  'Last week',
  'This month',
  'Last month'
];

const getPresetRange = (presetName: string): { startStr: string; endStr: string; label: string } => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let start = new Date(today);
  let end = new Date(today);

  switch (presetName) {
    case 'Today':
      break;
    case 'Yesterday':
      start.setDate(today.getDate() - 1);
      end.setDate(today.getDate() - 1);
      break;
    case 'Today and yesterday':
      start.setDate(today.getDate() - 1);
      break;
    case 'Last 7 days':
      start.setDate(today.getDate() - 6);
      break;
    case 'Last 14 days':
      start.setDate(today.getDate() - 13);
      break;
    case 'Last 28 days':
      start.setDate(today.getDate() - 27);
      break;
    case 'Last 30 days':
      start.setDate(today.getDate() - 29);
      break;
    case 'This week': {
      const currentDay = today.getDay();
      start.setDate(today.getDate() - currentDay);
      break;
    }
    case 'Last week': {
      const currentDay = today.getDay();
      start.setDate(today.getDate() - currentDay - 7);
      end.setDate(today.getDate() - currentDay - 1);
      break;
    }
    case 'This month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;
    case 'Last month':
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'Maximum':
    default:
      return { startStr: '', endStr: '', label: 'Maximum' };
  }

  return {
    startStr: formatDateToYYYYMMDD(start),
    endStr: formatDateToYYYYMMDD(end),
    label: presetName
  };
};

export default function UserDashboard({ user, onLogout }: UserDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // Google Drive Integration State
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveUser, setDriveUser] = useState<any>(null);
  const [isRefreshingDrive, setIsRefreshingDrive] = useState(false);
  const [driveStatusFeedback, setDriveStatusFeedback] = useState<string | null>(null);
  const [showDriveConnectModal, setShowDriveConnectModal] = useState(false);
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');

  const handleConnectDriveTemporary = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setDriveToken(res.accessToken);
        setDriveUser(res.user);

        // Save Google Drive integration centrally on the server
        await fetch('/api/drive/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: res.accessToken,
            user: { email: res.user.email, displayName: res.user.displayName || "" },
            requesterId: user.userId
          })
        });
        
        setShowDriveConnectModal(false);
        alert('Connected successfully! Standard Google connection is valid for 1 hour of active use.');
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to authenticate with Google Drive: ' + (err.message || err));
    }
  };

  const handleConnectDrivePersistent = () => {
    if (!customClientId.trim() || !customClientSecret.trim()) {
      alert('Please enter both Google Client ID and Google Client Secret.');
      return;
    }

    const redirectUri = `${window.location.origin}/api/drive/callback`;
    const triggerUrl = `/api/drive/auth-initiate?clientId=${encodeURIComponent(customClientId.trim())}&clientSecret=${encodeURIComponent(customClientSecret.trim())}&requesterId=${encodeURIComponent(user.userId)}&redirectUri=${encodeURIComponent(redirectUri)}`;

    const popupWidth = 600;
    const popupHeight = 700;
    const left = window.screen.width / 2 - popupWidth / 2;
    const top = window.screen.height / 2 - popupHeight / 2;

    const popup = window.open(
      triggerUrl,
      'google_drive_persistent_oauth',
      `width=${popupWidth},height=${popupHeight},left=${left},top=${top},status=no,resizable=yes`
    );

    if (!popup) {
      alert("Popup blocked! Direct auth requests require standard browser popups. Please check your browser bar settings to allow popups.");
    }
  };

  const handleDisconnectDrive = async () => {
    try {
      await googleDriveLogout();
      setDriveToken(null);
      setDriveUser(null);

      // Remove Google Drive integration centrally from the server
      await fetch('/api/drive/config', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.userId
        })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefreshDriveConnection = async () => {
    setIsRefreshingDrive(true);
    setDriveStatusFeedback(null);
    try {
      const response = await fetch('/api/drive/config?forceRefresh=true');
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (response.ok && data.success && data.connected) {
          setDriveToken(data.config.accessToken);
          setDriveUser(data.config.user);
          setDriveStatusFeedback("Verified!");
        } else {
          setDriveToken(null);
          setDriveUser(null);
          setDriveStatusFeedback("Offline/Stale");
        }
      } else {
        setDriveStatusFeedback("Offline/Stale");
      }
    } catch (err) {
      console.error("Failed to refresh Google Drive status:", err);
      setDriveStatusFeedback("Fetch error");
    } finally {
      setIsRefreshingDrive(false);
      setTimeout(() => {
        setDriveStatusFeedback(null);
      }, 3000);
    }
  };

  useEffect(() => {
    const fetchDriveConfig = async () => {
      try {
        const response = await fetch('/api/drive/config');
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          if (response.ok && data.success && data.connected) {
            setDriveToken(data.config.accessToken);
            setDriveUser(data.config.user);
          } else {
            setDriveToken(null);
            setDriveUser(null);
          }
        }
      } catch (err) {
        console.error("Failed to load Google Drive configuration from server:", err);
      }
    };
    fetchDriveConfig();
  }, []);

  useEffect(() => {
    const handleOauthMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_DRIVE_PERSIST_SUCCESS') {
        try {
          const response = await fetch('/api/drive/config');
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            if (response.ok && data.success && data.connected) {
              setDriveToken(data.config.accessToken);
              setDriveUser(data.config.user);
              setShowDriveConnectModal(false);
            }
          }
        } catch (err) {
          console.error("Failed to load persistently connected Google Drive configuration:", err);
        }
      }
    };
    window.addEventListener('message', handleOauthMessage);
    return () => window.removeEventListener('message', handleOauthMessage);
  }, []);

  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [uploadingFinal, setUploadingFinal] = useState(false);
  const [sampleUploadProgress, setSampleUploadProgress] = useState<string | null>(null);
  const [finalUploadProgress, setFinalUploadProgress] = useState<string | null>(null);
  const [deliveryDateEdit, setDeliveryDateEdit] = useState('');
  const [isEditingDeliveryDate, setIsEditingDeliveryDate] = useState(false);
  const [copied, setCopied] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [activePreset, setActivePreset] = useState('Maximum');

  const handlePresetSelect = (preset: string) => {
    const range = getPresetRange(preset);
    setStartDateStr(range.startStr);
    setEndDateStr(range.endStr);
    setActivePreset(preset);
    setIsDateFilterOpen(false);
  };

  const handleCopyScript = () => {
    if (!selectedTask || !selectedTask.script) return;
    navigator.clipboard.writeText(selectedTask.script);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1500);
  };

  // Fetch tasks
  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/tasks');
      const data = await response.json();
      if (response.ok && data.success) {
        // Filter by assigned creator user (match case-insensitive user.userId) and show newest first
        const myTasks = data.tasks.filter(
          (t: Task) => t.issuedToWhom?.toLowerCase().trim() === user.name.toLowerCase().trim()
        ).reverse();
        setTasks(myTasks);
        if (selectedTask) {
          const freshTask = myTasks.find((t: Task) => t.id === selectedTask.id);
          if (freshTask) setSelectedTask(freshTask);
        }
      }
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [user.name]);

  // Filter tasks by date range only for KPIs
  const dateFilteredTasksForKPIs = tasks.filter(task => {
    let matchesDate = true;
    const taskDateObj = parseDDMMYYYY(task.orderDate);
    if (taskDateObj) {
      const taskYMD = formatDateToYYYYMMDD(taskDateObj);
      if (startDateStr && taskYMD < startDateStr) {
        matchesDate = false;
      }
      if (endDateStr && taskYMD > endDateStr) {
        matchesDate = false;
      }
    }
    return matchesDate;
  });

  // Statistics calculations for logged in creator based on date filter
  const totalAssigned = dateFilteredTasksForKPIs.length;
  
  const totalEarnedAndPaid = dateFilteredTasksForKPIs
    .filter(t => t.paidToCreator === 'Yes')
    .reduce((agg, cur) => agg + (cur.payableAmountToCreator || 0), 0);

  const totalPending = dateFilteredTasksForKPIs
    .filter(t => t.paidToCreator === 'No')
    .reduce((agg, cur) => agg + (cur.payableAmountToCreator || 0), 0);

  const pendingProjects = dateFilteredTasksForKPIs.filter(t => t.orderStatus === 'Pending').length;
  const inProgressProjects = dateFilteredTasksForKPIs.filter(t => t.orderStatus === 'In Progress').length;
  const completedProjects = dateFilteredTasksForKPIs.filter(t => t.orderStatus === 'Completed').length;

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = 
      (task.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.videoName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.category || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'All' || task.orderStatus === statusFilter;

    let matchesDate = true;
    const taskDateObj = parseDDMMYYYY(task.orderDate);
    if (taskDateObj) {
      const taskYMD = formatDateToYYYYMMDD(taskDateObj);
      if (startDateStr && taskYMD < startDateStr) {
        matchesDate = false;
      }
      if (endDateStr && taskYMD > endDateStr) {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  const handleStatusChange = async (taskId: string, newStatus: 'Pending' | 'In Progress' | 'Completed') => {
    setStatusUpdating(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: newStatus }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        // Update local tasks
        setTasks(prev => prev.map(t => t.id === taskId ? data.task : t));
        setSelectedTask(data.task);
        setDeliveryDateEdit(data.task.deliveryDate || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleSaveDeliveryDate = async () => {
    if (!selectedTask) return;
    setStatusUpdating(true);
    try {
      const response = await fetch(`/api/tasks/${selectedTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryDate: deliveryDateEdit }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setTasks(prev => prev.map(t => t.id === selectedTask.id ? data.task : t));
        setSelectedTask(data.task);
        setIsEditingDeliveryDate(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setStatusUpdating(false);
    }
  };

  // Uploading Sample files
  const handleSampleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedTask) return;
    setUploadingSample(true);

    const filesToUpload = Array.from(e.target.files) as File[];
    let driveUrlsMapping: Record<string, string> = {};

    // Just-in-time check to see if the server has refreshed the token, or to trigger a refresh
    let activeToken = driveToken;
    try {
      const configRes = await fetch('/api/drive/config');
      const configData = await configRes.json();
      if (configRes.ok && configData.success && configData.connected) {
        activeToken = configData.config.accessToken;
        setDriveToken(activeToken);
        setDriveUser(configData.config.user);
      }
    } catch (confErr) {
      console.error("Just-in-time token update error:", confErr);
    }

    if (activeToken) {
      try {
        const rootId = await getOrCreateFolder(activeToken, "Templatesvilla Ledger Docs");
        const folderId = await getOrCreateFolder(activeToken, "Sample Reference Files", rootId);
        
        const totalFiles = filesToUpload.length;
        let uploadedCount = 0;
        let lastProgresses: Record<string, string> = {};
        const updateOverallProgress = () => {
          if (totalFiles === 1) {
            const keys = Object.keys(lastProgresses);
            setSampleUploadProgress(keys.length > 0 ? `Drive: ${lastProgresses[keys[0]]}` : "Uploading to Drive...");
          } else {
            const percentageSummary = Object.entries(lastProgresses).map(([_, progress]) => progress).join(', ');
            setSampleUploadProgress(`Drive ${uploadedCount}/${totalFiles} (${percentageSummary})`);
          }
        };

        const uploadPromises = filesToUpload.map(async (file) => {
          const result = await uploadFileToDrive(activeToken, file, folderId, undefined, (progressStr) => {
            lastProgresses[file.name] = progressStr;
            updateOverallProgress();
          });
          uploadedCount++;
          updateOverallProgress();
          return { name: file.name, url: result.webViewLink };
        });
        
        const results = await Promise.all(uploadPromises);
        results.forEach(res => {
          driveUrlsMapping[res.name] = res.url;
        });
      } catch (driveErr: any) {
        console.error("Google Drive Upload Error, initiating background live force token refresh autocheck: ", driveErr);
        // Attempt immediate token self-healing refresh
        try {
          const configRes = await fetch('/api/drive/config?forceRefresh=true');
          const configData = await configRes.json();
          if (configRes.ok && configData.success && configData.connected) {
            const freshToken = configData.config.accessToken;
            setDriveToken(freshToken);
            setDriveUser(configData.config.user);
            console.log("Token successfully force-renewed. Retrying Google Drive upload sequence...");
            
            const rootId = await getOrCreateFolder(freshToken, "Templatesvilla Ledger Docs");
            const folderId = await getOrCreateFolder(freshToken, "Sample Reference Files", rootId);
            
            const totalFiles = filesToUpload.length;
            let uploadedCount = 0;
            let lastProgresses: Record<string, string> = {};
            const updateOverallProgress = () => {
              if (totalFiles === 1) {
                const keys = Object.keys(lastProgresses);
                setSampleUploadProgress(keys.length > 0 ? `Drive: ${lastProgresses[keys[0]]}` : "Uploading to Drive...");
              } else {
                const percentageSummary = Object.entries(lastProgresses).map(([_, progress]) => progress).join(', ');
                setSampleUploadProgress(`Drive ${uploadedCount}/${totalFiles} (${percentageSummary})`);
              }
            };

            const uploadPromises = filesToUpload.map(async (file) => {
              const result = await uploadFileToDrive(freshToken, file, folderId, undefined, (progressStr) => {
                lastProgresses[file.name] = progressStr;
                updateOverallProgress();
              });
              uploadedCount++;
              updateOverallProgress();
              return { name: file.name, url: result.webViewLink };
            });
            
            const results = await Promise.all(uploadPromises);
            results.forEach(res => {
              driveUrlsMapping[res.name] = res.url;
            });
            console.log("Auto-retry upload sequence succeeded!");
          }
        } catch (retryErr) {
          console.error("Auto-retry upload failed completely:", retryErr);
        }
      }
    }

    if (activeToken && Object.keys(driveUrlsMapping).length > 0) {
      // Send metadata-only JSON to keep payload lightweight and bypass any size limits
      try {
        const metadataFiles = filesToUpload.map(file => ({
          name: file.name,
          size: file.size,
          driveUrl: driveUrlsMapping[file.name] || ""
        }));

        const response = await fetch(`/api/upload/sample?taskId=${selectedTask.id}&uploadedBy=User&uploaderName=${encodeURIComponent(user.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadataFiles }),
        });
        const data = await response.json();
        if (response.ok && data.success) {
          setTasks(prev => prev.map(t => t.id === selectedTask.id ? data.task : t));
          setSelectedTask(data.task);
        }
      } catch (err) {
        console.error("Failed to post sample file metadata:", err);
      } finally {
        setUploadingSample(false);
      }
      return;
    }

    // Direct fallback server upload
    const tooLargeFile = filesToUpload.find(file => file.size > 1000 * 1024 * 1024);
    if (tooLargeFile) {
      alert(`The file "${tooLargeFile.name}" is larger than 1000MB (1 GB). Direct server uploads have a size limit under server infrastructure settings. Please compress the file or connect your Google Drive to unlock seamless ultra-large file transfers!`);
      setUploadingSample(false);
      return;
    }

    try {
      let updatedTask = selectedTask;
      for (const file of filesToUpload) {
        if (file.size > 10 * 1024 * 1024) {
          // Large file: chunked upload with live progress tracking
          const res = await uploadFileInChunks(
            file,
            selectedTask.id,
            'sample',
            'User',
            '',
            user.name,
            (progressStr) => setSampleUploadProgress(progressStr)
          );
          if (res && res.success) {
            updatedTask = res.task;
          }
        } else {
          // Small file: fast single-request upload
          setSampleUploadProgress("Uploading...");
          const formData = new FormData();
          formData.append('files', file);
          const response = await fetch(`/api/upload/sample?taskId=${selectedTask.id}&uploadedBy=User&uploaderName=${encodeURIComponent(user.name)}`, {
            method: 'POST',
            body: formData,
          });
          const res = await response.json();
          if (response.ok && res.success) {
            updatedTask = res.task;
          } else {
            throw new Error(res.message || "Failed to upload file.");
          }
        }
      }
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? updatedTask : t));
      setSelectedTask(updatedTask);
    } catch (err: any) {
      console.error(err);
      alert(`Direct upload failed: ${err.message || err}`);
    } finally {
      setUploadingSample(false);
      setSampleUploadProgress(null);
    }
  };

  // Uploading Final video files
  const handleFinalVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedTask) return;
    setUploadingFinal(true);

    const filesToUpload = Array.from(e.target.files) as File[];
    const existingCount = (selectedTask.finalVideos || []).length;
    let driveUrlsMapping: Record<string, string> = {};

    // Just-in-time check to see if the server has refreshed the token, or to trigger a refresh
    let activeToken = driveToken;
    try {
      const configRes = await fetch('/api/drive/config');
      const configData = await configRes.json();
      if (configRes.ok && configData.success && configData.connected) {
        activeToken = configData.config.accessToken;
        setDriveToken(activeToken);
        setDriveUser(configData.config.user);
      }
    } catch (confErr) {
      console.error("Just-in-time token update error (final video):", confErr);
    }

    if (activeToken) {
      try {
        const rootId = await getOrCreateFolder(activeToken, "Templatesvilla Ledger Docs");
        const clientsId = await getOrCreateFolder(activeToken, "Clients", rootId);
        const clientFolderName = selectedTask.clientName || "Unknown_Client";
        const clientFolderId = await getOrCreateFolder(activeToken, clientFolderName, clientsId);
        
        const totalFiles = filesToUpload.length;
        let uploadedCount = 0;
        let lastProgresses: Record<string, string> = {};
        const updateOverallProgress = () => {
          if (totalFiles === 1) {
            const keys = Object.keys(lastProgresses);
            setFinalUploadProgress(keys.length > 0 ? `Drive: ${lastProgresses[keys[0]]}` : "Uploading to Drive...");
          } else {
            const percentageSummary = Object.entries(lastProgresses).map(([_, progress]) => progress).join(', ');
            setFinalUploadProgress(`Drive ${uploadedCount}/${totalFiles} (${percentageSummary})`);
          }
        };

        const uploadPromises = filesToUpload.map(async (file, idx) => {
          const lastDotIdx = file.name.lastIndexOf('.');
          const ext = lastDotIdx !== -1 ? file.name.substring(lastDotIdx) : '';
          const customName = (filesToUpload.length === 1 && existingCount === 0)
            ? `${selectedTask.id}${ext}`
            : `${selectedTask.id}_${existingCount + idx + 1}${ext}`;
          const result = await uploadFileToDrive(activeToken, file, clientFolderId, customName, (progressStr) => {
            lastProgresses[customName] = progressStr;
            updateOverallProgress();
          });
          uploadedCount++;
          updateOverallProgress();
          return { customName, url: result.webViewLink };
        });
        
        const results = await Promise.all(uploadPromises);
        results.forEach(res => {
          driveUrlsMapping[res.customName] = res.url;
        });
      } catch (driveErr: any) {
        console.error("Google Drive Final Video Upload Error, initiating background live force token refresh autocheck: ", driveErr);
        // Attempt immediate token self-healing refresh
        try {
          const configRes = await fetch('/api/drive/config?forceRefresh=true');
          const configData = await configRes.json();
          if (configRes.ok && configData.success && configData.connected) {
            const freshToken = configData.config.accessToken;
            setDriveToken(freshToken);
            setDriveUser(configData.config.user);
            console.log("Token successfully force-renewed. Retrying Google Drive upload sequence...");
            
            const rootId = await getOrCreateFolder(freshToken, "Templatesvilla Ledger Docs");
            const clientsId = await getOrCreateFolder(freshToken, "Clients", rootId);
            const clientFolderName = selectedTask.clientName || "Unknown_Client";
            const clientFolderId = await getOrCreateFolder(freshToken, clientFolderName, clientsId);
            
            const existingCount = (selectedTask.finalVideos || []).length;
            const totalFiles = filesToUpload.length;
            let uploadedCount = 0;
            let lastProgresses: Record<string, string> = {};
            const updateOverallProgress = () => {
              if (totalFiles === 1) {
                const keys = Object.keys(lastProgresses);
                setFinalUploadProgress(keys.length > 0 ? `Drive: ${lastProgresses[keys[0]]}` : "Uploading to Drive...");
              } else {
                const percentageSummary = Object.entries(lastProgresses).map(([_, progress]) => progress).join(', ');
                setFinalUploadProgress(`Drive ${uploadedCount}/${totalFiles} (${percentageSummary})`);
              }
            };

            const uploadPromises = filesToUpload.map(async (file, idx) => {
              const lastDotIdx = file.name.lastIndexOf('.');
              const ext = lastDotIdx !== -1 ? file.name.substring(lastDotIdx) : '';
              const customName = (filesToUpload.length === 1 && existingCount === 0)
                ? `${selectedTask.id}${ext}`
                : `${selectedTask.id}_${existingCount + idx + 1}${ext}`;
              const result = await uploadFileToDrive(freshToken, file, clientFolderId, customName, (progressStr) => {
                lastProgresses[customName] = progressStr;
                updateOverallProgress();
              });
              uploadedCount++;
              updateOverallProgress();
              return { customName, url: result.webViewLink };
            });
            
            const results = await Promise.all(uploadPromises);
            results.forEach(res => {
              driveUrlsMapping[res.customName] = res.url;
            });
            console.log("Auto-retry upload sequence succeeded!");
          }
        } catch (retryErr) {
          console.error("Auto-retry final video upload failed completely:", retryErr);
        }
      }
    }

    if (activeToken && Object.keys(driveUrlsMapping).length > 0) {
      // Send metadata-only JSON to keep payload lightweight and bypass any size limits
      try {
        const metadataFiles = filesToUpload.map((file, idx) => {
          const lastDotIdx = file.name.lastIndexOf('.');
          const ext = lastDotIdx !== -1 ? file.name.substring(lastDotIdx) : '';
          const customName = (filesToUpload.length === 1 && existingCount === 0)
            ? `${selectedTask.id}${ext}`
            : `${selectedTask.id}_${existingCount + idx + 1}${ext}`;

          return {
            name: customName,
            size: file.size,
            driveUrl: driveUrlsMapping[customName] || ""
          };
        });

        const response = await fetch(`/api/upload/final?taskId=${selectedTask.id}&clientName=${encodeURIComponent(selectedTask.clientName)}&uploaderName=${encodeURIComponent(user.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadataFiles }),
        });
        const data = await response.json();
        if (response.ok && data.success) {
          setTasks(prev => prev.map(t => t.id === selectedTask.id ? data.task : t));
          setSelectedTask(data.task);
        }
      } catch (err) {
        console.error("Failed to post final video metadata:", err);
      } finally {
        setUploadingFinal(false);
      }
      return;
    }

    // Direct fallback server upload
    const tooLargeFile = filesToUpload.find(file => file.size > 1000 * 1024 * 1024);
    if (tooLargeFile) {
      alert(`The file "${tooLargeFile.name}" is larger than 1000MB (1 GB). Direct server uploads have a size limit under server infrastructure settings. Please compress the file or connect your Google Drive to unlock seamless ultra-large file transfers!`);
      setUploadingFinal(false);
      return;
    }

    try {
      let updatedTask = selectedTask;
      const uploadExistingCount = (selectedTask.finalVideos || []).length;

      for (let idx = 0; idx < filesToUpload.length; idx++) {
        const file = filesToUpload[idx];
        const lastDotIdx = file.name.lastIndexOf('.');
        const ext = lastDotIdx !== -1 ? file.name.substring(lastDotIdx) : '';
        const customName = (filesToUpload.length === 1 && uploadExistingCount === 0)
          ? `${selectedTask.id}${ext}`
          : `${selectedTask.id}_${uploadExistingCount + idx + 1}${ext}`;

        if (file.size > 10 * 1024 * 1024) {
          // Large file: chunked upload with live progress tracking
          const res = await uploadFileInChunks(
            file,
            selectedTask.id,
            'final',
            'User',
            selectedTask.clientName || 'Unknown_Client',
            user.name,
            (progressStr) => setFinalUploadProgress(progressStr),
            customName
          );
          if (res && res.success) {
            updatedTask = res.task;
          }
        } else {
          // Small file: standard upload
          setFinalUploadProgress("Uploading...");
          const formData = new FormData();
          formData.append('files', file, customName);
          const response = await fetch(`/api/upload/final?taskId=${selectedTask.id}&clientName=${encodeURIComponent(selectedTask.clientName)}&uploaderName=${encodeURIComponent(user.name)}`, {
            method: 'POST',
            body: formData,
          });
          const res = await response.json();
          if (response.ok && res.success) {
            updatedTask = res.task;
          } else {
            throw new Error(res.message || "Failed to upload file.");
          }
        }
      }
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? updatedTask : t));
      setSelectedTask(updatedTask);
    } catch (err: any) {
      console.error(err);
      alert(`Direct export upload failed: ${err.message || err}`);
    } finally {
      setUploadingFinal(false);
      setFinalUploadProgress(null);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col font-sans">
      {/* Top Banner Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-sm shadow-sm">
              TV
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">TEAM MEMBER DASHBOARD</span>
              <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Welcome, <span className="text-slate-900 font-extrabold">{user.name}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={fetchTasks} 
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 cursor-pointer shadow-xs transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Sync Data
            </button>
            <button 
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-red-50 text-red-700 hover:bg-red-100 border border-red-100/60 rounded-lg cursor-pointer transition-all"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-6 space-y-6 flex-1 w-full">
        {/* Creator KPIs Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Assigned Tasks</span>
              <div className="p-2 bg-slate-50 text-slate-700 rounded-lg border border-slate-100">
                <Briefcase className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{totalAssigned}</p>
              <p className="text-xs text-slate-500 mt-1">{pendingProjects} pending, {inProgressProjects} active, {completedProjects} completed</p>
            </div>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Tasks</span>
              <div className="p-2 bg-rose-50 text-rose-700 rounded-lg">
                <Timer className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-rose-700">{pendingProjects}</p>
              <p className="text-xs text-slate-500 mt-1">Awaiting your execution</p>
            </div>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Projects</span>
              <div className="p-2 bg-green-50 text-green-700 rounded-lg">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">{completedProjects}</p>
              <p className="text-xs text-slate-500 mt-1">Ready for client dispatch</p>
            </div>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Income Paid (To You)</span>
              <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                <Landmark className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700 font-mono">₹{totalEarnedAndPaid.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">Cleared in corporate account</p>
            </div>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Compensation</span>
              <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-700 font-mono">₹{totalPending.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">Unreleased creator payment</p>
            </div>
          </div>
        </div>

        {/* Dynamic Filters Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 items-end relative z-20">
          {/* Find Project */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Find Project</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Client, video name, ID..."
                className="w-full pl-8 pr-3 py-2 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent cursor-pointer"
            >
              <option value="All">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          {/* Created Date Range */}
          <div className="space-y-1.5 relative">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Created Date Range</label>
            <button
              type="button"
              id="date-filter-toggle-btn"
              onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
              className="w-full h-9 px-3.5 bg-slate-50/40 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent cursor-pointer transition-all hover:bg-slate-100/50"
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span className="truncate">
                  {(() => {
                    if (!startDateStr && !endDateStr) return 'All Time (Maximum)';
                    if (activePreset === 'Today' || activePreset === 'Yesterday') {
                      return `${activePreset}: ${formatHumanDate(startDateStr)}`;
                    }
                    if (activePreset !== 'Custom Range' && activePreset !== 'Custom') {
                      return `${activePreset}`;
                    }
                    if (startDateStr && endDateStr) {
                      if (startDateStr === endDateStr) return formatHumanDate(startDateStr);
                      return `${formatHumanDate(startDateStr)} - ${formatHumanDate(endDateStr)}`;
                    }
                    if (startDateStr) return `Since ${formatHumanDate(startDateStr)}`;
                    if (endDateStr) return `Until ${formatHumanDate(endDateStr)}`;
                    return 'All Time (Maximum)';
                  })()}
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0 ${isDateFilterOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDateFilterOpen && (
              <>
                {/* Underlay click capture to close */}
                <div 
                  id="date-filter-overlay-backdrop-user"
                  className="fixed inset-0 z-40 bg-transparent" 
                  onClick={() => setIsDateFilterOpen(false)}
                />
                
                {/* Preset Options Dropdown Panel */}
                <div 
                  id="date-filter-dropdown-panel-user"
                  className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 flex flex-col w-[240px] overflow-hidden"
                >
                  <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Created Date Options</span>
                  </div>
                  <div className="p-2 max-h-[300px] overflow-y-auto space-y-0.5">
                    {PRESET_OPTIONS.map((opt) => {
                      const isSelected = activePreset === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handlePresetSelect(opt)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected 
                              ? 'bg-blue-50 text-blue-700 font-bold' 
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <span>{opt === 'Maximum' ? 'All Time (Maximum)' : opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Master Project Split Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* List of Projects (Left half) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
              <h2 className="font-bold text-xs text-slate-400 uppercase tracking-wider">
                Assigned Video Requests ({filteredTasks.length} of {tasks.length})
              </h2>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                <Loader2 className="animate-spin h-6 w-6 text-gray-500" />
                <span className="text-xs font-mono">Syncing assigned tasks...</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="py-20 text-center text-gray-400 font-mono text-xs px-4">
                {tasks.length === 0 ? "No video projects currently assigned to you." : "No projects match your search/filter parameters."}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
                {filteredTasks.map((task) => {
                  const isSelected = selectedTask && selectedTask.id === task.id;
                  return (
                    <button
                      key={task.id}
                      onClick={() => {
                        setSelectedTask(task);
                        setDeliveryDateEdit(task.deliveryDate || '');
                        setIsEditingDeliveryDate(false);
                      }}
                      className={`w-full text-left p-4 hover:bg-slate-50/50 transition-all block focus:outline-none relative ${
                        isSelected ? 'bg-slate-50 border-r-4 border-blue-600 font-semibold' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                          {task.id}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded-full block w-max ${
                          task.orderStatus === 'Completed' ? 'bg-green-100 text-green-700' :
                          task.orderStatus === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {task.orderStatus}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-slate-800 truncate">
                        {task.videoName}
                      </h3>
                      <div className="flex items-center justify-between mt-2.5 text-[11px] text-slate-500">
                        <span>Issued: {task.orderDate}</span>
                        <span className="font-bold text-slate-700 font-mono">₹{task.payableAmountToCreator} Payable</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Detail & Interaction Desk (Right half) */}
          <div className="lg:col-span-7 space-y-6">
            {selectedTask ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" id="task-user-workspace">
                <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{selectedTask.id}</span>
                      <span className="text-xs text-slate-300">•</span>
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{selectedTask.category}</span>
                    </div>
                    <h2 className="font-bold text-lg text-slate-800 leading-tight">
                      {selectedTask.videoName}
                    </h2>
                  </div>
                  
                  {/* Status Dropdown Trigger */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Update Order Status</label>
                    <select
                      value={selectedTask.orderStatus}
                      disabled={statusUpdating}
                      onChange={(e) => handleStatusChange(selectedTask.id, e.target.value as any)}
                      className="text-xs px-3 py-2 border border-slate-200 rounded-lg font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all cursor-pointer select-element"
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>

                <div className="p-6 space-y-8">
                  {/* Client and Financial Attributes */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6 border-b border-slate-100">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Order Issued</span>
                      <span className="text-sm font-bold text-slate-800">{selectedTask.orderDate}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Delivery Date</span>
                      {selectedTask.orderStatus === 'Completed' ? (
                        isEditingDeliveryDate ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={deliveryDateEdit}
                              onChange={(e) => setDeliveryDateEdit(e.target.value)}
                              placeholder="DD/MM/YYYY"
                              className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none max-w-[110px] focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-slate-50"
                            />
                            <button
                              onClick={handleSaveDeliveryDate}
                              className="text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                              {selectedTask.deliveryDate || 'Not specified'}
                            </span>
                            <button
                              onClick={() => {
                                setDeliveryDateEdit(selectedTask.deliveryDate || '');
                                setIsEditingDeliveryDate(true);
                              }}
                              className="text-[10px] text-blue-600 hover:text-blue-800 underline ml-1 cursor-pointer font-bold"
                            >
                              Edit
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-slate-400 font-mono">Set when completed</span>
                      )}
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Your Payable</span>
                      <span className="text-sm font-bold text-slate-800 font-mono">₹{selectedTask.payableAmountToCreator}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Released</span>
                      <span className={`text-[10px] block font-bold uppercase tracking-wider text-center py-1.5 px-3.5 rounded-full ${
                        selectedTask.paidToCreator === 'Yes' 
                          ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                          : 'bg-orange-50 text-orange-700 border border-orange-100'
                      }`}>
                        {selectedTask.paidToCreator === 'Yes' ? `Yes` : 'No'}
                      </span>
                    </div>
                  </div>

                  {/* Task Script paste Desk */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-500" />
                        <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Video Script Text Box</h3>
                      </div>
                      {selectedTask.script && (
                        <button
                          type="button"
                          onClick={handleCopyScript}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all cursor-pointer border border-slate-200/60 shadow-3xs"
                        >
                          {copied ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />
                              <span className="text-emerald-700">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy Script</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 max-h-[180px] overflow-y-auto">
                      {selectedTask.script ? (
                        <p className="text-sm text-slate-700 leading-relaxed font-sans whitespace-pre-wrap">
                          {selectedTask.script}
                        </p>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono block text-center py-4">
                          No script provided for this project yet. Please coordinate with Admin.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sample Attachments Room */}
                  <div className="space-y-5 pt-5 border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase className="h-4 w-4 text-slate-500" />
                      <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                        Sample Files & Briefs Video List
                      </h3>
                    </div>

                    {/* Section 1: Admin Given Samples */}
                    <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-150/60">
                      <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                        <div className="w-1.5 h-3.5 bg-blue-500 rounded-xs"></div>
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Admin Given Samples / References</h4>
                      </div>
                      {selectedTask.sampleFiles && selectedTask.sampleFiles.filter(file => file.uploadedBy === 'Admin').length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedTask.sampleFiles.filter(file => file.uploadedBy === 'Admin').map((file) => (
                            <div key={file.id} className="p-3 bg-white border border-slate-205 rounded-lg shadow-3xs flex flex-col justify-between gap-2">
                              <span className="text-xs font-bold text-slate-700 truncate block">
                                {file.name}
                              </span>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                <span>{(file.size / (1024 * 1024)).toFixed(2)} MB • Admin</span>
                                <div className="flex gap-2">
                                  <a
                                    href={getFileViewUrl(file)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-0.5 font-bold"
                                  >
                                    <Download className="h-3 w-3" /> View/Get
                                  </a>
                                  <a
                                    href={file.driveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5 font-bold"
                                  >
                                    <ExternalLink className="h-3 w-3" /> Drive
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-[11px] text-slate-400 font-mono italic">
                          No Admin-uploaded references.
                        </div>
                      )}
                    </div>

                    {/* Section 2: User Given Samples */}
                    <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-150/60">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-3.5 bg-indigo-500 rounded-xs"></div>
                          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">User Given Samples / Briefs</h4>
                        </div>
                        <div className="flex flex-col items-end">
                          <label className="text-xs inline-flex items-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded-lg font-bold cursor-pointer shadow-3xs transition-all">
                            {uploadingSample ? (
                              <>
                                <Loader2 className="animate-spin h-3.5 w-3.5" />
                                <span className="text-[11px]">{sampleUploadProgress || "Uploading..."}</span>
                              </>
                            ) : (
                              <>
                                <UploadCloud className="h-3.5 w-3.5" />
                                <span className="text-[11px]">Upload samples</span>
                              </>
                            )}
                            <input
                              type="file"
                              multiple
                              onChange={handleSampleFileUpload}
                              disabled={uploadingSample}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Stored automatically in Google Drive under “Sample Folder”
                      </p>

                      {selectedTask.sampleFiles && selectedTask.sampleFiles.filter(file => file.uploadedBy !== 'Admin').length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedTask.sampleFiles.filter(file => file.uploadedBy !== 'Admin').map((file) => (
                            <div key={file.id} className="p-3 bg-white border border-slate-205 rounded-lg shadow-3xs flex flex-col justify-between gap-2">
                              <span className="text-xs font-bold text-slate-700 truncate block">
                                {file.name}
                              </span>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                <span>{(file.size / (1024 * 1024)).toFixed(2)} MB • User</span>
                                <div className="flex gap-2">
                                  <a
                                    href={getFileViewUrl(file)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-0.5 font-bold"
                                  >
                                    <Download className="h-3 w-3" /> View/Get
                                  </a>
                                  <a
                                    href={file.driveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5 font-bold"
                                  >
                                    <ExternalLink className="h-3 w-3" /> Drive
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-[11px] text-slate-400 font-mono italic">
                          No User-uploaded samples yet.
                        </div>
                      )}
                    </div>

                    {/* Share Sample to WhatsApp */}
                    {(() => {
                      const userSampleFiles = selectedTask.sampleFiles ? selectedTask.sampleFiles.filter(file => file.uploadedBy !== 'Admin') : [];
                      const latestSampleFile = userSampleFiles.length > 0 ? userSampleFiles[userSampleFiles.length - 1] : null;
                      const latestSampleLink = latestSampleFile ? (latestSampleFile.driveUrl || getFileViewUrl(latestSampleFile)) : '';

                      const sampleMsgText = latestSampleFile
                        ? `Hi,

I have sent you the sample for:

Task ID: ${selectedTask.id}
Video Name: ${selectedTask.videoName}
Link: ${latestSampleLink}

Please forward it to the respective client and let me know once it has been approved.

Thanks.`
                        : `Hi,

I have sent you the sample for:

Task ID: ${selectedTask.id}
Video Name: ${selectedTask.videoName}

Please forward it to the respective client and let me know once it has been Approved.

Thanks.`;

                      return (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-emerald-50 rounded-xl border border-emerald-100 mt-2.5 shadow-3xs">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">Quick Notification (WhatsApp)</span>
                          </div>
                          <a
                            href={`https://wa.me/918984597200?text=${encodeURIComponent(sampleMsgText)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-4 py-2.5 rounded-lg shadow-sm transition-all hover:scale-[1.02] cursor-pointer"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            Share to WhatsApp
                          </a>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Final Output Assets Upload Section */}
                  <div className="space-y-3 pt-6 border-t border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                          Your Final Videos & Assets Delivery
                        </h3>
                      </div>
                      <label className="text-xs inline-flex items-center gap-1.5 bg-green-600 text-white hover:bg-green-700 px-3.5 py-2 rounded-lg font-bold cursor-pointer max-w-fit shadow-xs transition-colors">
                        {uploadingFinal ? (
                          <>
                            <Loader2 className="animate-spin h-3.5 w-3.5" />
                            {finalUploadProgress || "Uploading final file..."}
                          </>
                        ) : (
                          <>
                            <UploadCloud className="h-3.5 w-3.5" />
                            Upload Final Output
                          </>
                        )}
                        <input
                          type="file"
                          multiple
                          onChange={handleFinalVideoUpload}
                          disabled={uploadingFinal}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {selectedTask.finalVideos && selectedTask.finalVideos.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        {selectedTask.finalVideos.map((file) => (
                          <div key={file.id} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col justify-between gap-2">
                            <span className="text-xs font-bold text-slate-700 truncate block">
                              {file.name}
                            </span>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                              <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                              <div className="flex gap-2">
                                <a
                                  href={getFileViewUrl(file)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-0.5 font-bold"
                                >
                                  <Download className="h-3 w-3" /> View/Get
                                </a>
                                <a
                                  href={file.driveUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5 font-bold"
                                >
                                  <ExternalLink className="h-3 w-3" /> Drive
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 font-mono bg-slate-50/50">
                        No final assets delivered yet. Upload completed videos so client can preview!
                      </div>
                    )}

                    {/* Share Final Output to WhatsApp */}
                    {(() => {
                      const finalFiles = selectedTask.finalVideos || [];
                      const latestFinalFile = finalFiles.length > 0 ? finalFiles[finalFiles.length - 1] : null;
                      const latestFinalLink = latestFinalFile ? (latestFinalFile.driveUrl || getFileViewUrl(latestFinalFile)) : '';

                      const finalMsgText = latestFinalFile
                        ? `Hi,

I have sent you the final video output for:

Task ID: ${selectedTask.id}
Video Name: ${selectedTask.videoName}
Link: ${latestFinalLink}

Please forward it to the respective client and let me know once it has been approved.

Thanks.`
                        : `Hi,

I have sent you the sample for:

Task ID: ${selectedTask.id}
Video Name: ${selectedTask.videoName}

Please forward it to the respective client and let me know once it has been Approved.

Thanks.`;

                      return (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-emerald-50 rounded-xl border border-emerald-100 mt-4 shadow-3xs">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">Quick Notification (WhatsApp)</span>
                          </div>
                          <a
                            href={`https://wa.me/918984597200?text=${encodeURIComponent(finalMsgText)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-4 py-2.5 rounded-lg shadow-sm transition-all hover:scale-[1.02] cursor-pointer"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            Share to WhatsApp
                          </a>
                        </div>
                      );
                    })()}
                  </div>

                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 space-y-4 shadow-sm" id="empty-user-details-alert">
                <Briefcase className="h-8 w-8 mx-auto text-slate-300" />
                <div>
                  <h3 className="font-bold text-sm text-slate-750">Project Desk is Empty</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                    Select any project from your list on the left to start viewing details, uploading files, reading/submitting scripts or modifying statuses.
                  </p>
                </div>
                <div className="pt-2">
                  <ArrowRight className="h-4 w-4 mx-auto text-slate-300 animate-pulse" />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 px-6 py-2.5 mt-8 flex flex-col md:flex-row justify-between items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        <span>System Status: Real-time Sync Active</span>
        <div className="flex items-center gap-3 flex-wrap">
          {driveUser ? (
            <span className="flex items-center gap-2 text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Google Drive: {driveUser.email} (Connected)
              <button type="button" onClick={handleDisconnectDrive} className="text-red-500 hover:text-red-700 font-extrabold normal-case underline ml-1.5 cursor-pointer">Disconnect</button>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-slate-300"></span>
              Google Drive: Offline
              <button type="button" onClick={() => setShowDriveConnectModal(true)} className="text-blue-600 hover:text-blue-800 font-extrabold normal-case underline ml-1.5 cursor-pointer">Connect Google Drive</button>
            </span>
          )}
          <button
            type="button"
            onClick={handleRefreshDriveConnection}
            disabled={isRefreshingDrive}
            className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-[9px] font-bold text-slate-600 hover:text-slate-800 disabled:opacity-50 cursor-pointer transition-all duration-200 normal-case"
            title="Verify status & keep connection alive"
          >
            <svg className={`w-3 h-3 ${isRefreshingDrive ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.2 3v13m0 0h-5m5 0V9"/>
            </svg>
            {isRefreshingDrive ? 'Verifying...' : 'Verify Status'}
          </button>
          {driveStatusFeedback && (
            <span className={`px-1.5 py-0.5 rounded text-[8px] tracking-normal font-sans font-semibold normal-case ${driveStatusFeedback.includes('Verified') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {driveStatusFeedback}
            </span>
          )}
        </div>
        <span>© 2026 Templatesvilla Admin Panel</span>
      </footer>

      {/* GOOGLE DRIVE CONNECT MODAL */}
      {showDriveConnectModal && (
        <div className="fixed inset-0 bg-gray-950/50 flex items-center justify-center p-4 z-50 overflow-y-auto normal-case tracking-normal">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-150 max-w-2xl w-full overflow-hidden my-8">
            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-1 px-2 rounded-lg bg-blue-50 text-blue-600 font-extrabold text-[10px] uppercase font-mono">Integration</div>
                <h3 className="font-extrabold text-sm text-gray-800 uppercase tracking-widest">Connect Google Drive</h3>
              </div>
              <button onClick={() => setShowDriveConnectModal(false)} className="p-1 rounded hover:bg-gray-100 cursor-pointer">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs text-gray-700">
              <p className="text-[11px] leading-relaxed text-slate-500">
                Choose how you want to connect Google Drive to Templatesvilla. You can select either a quick sandbox test or a persistent production config.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* OPTION A: STANDARD INTERACTIVE SIGN-IN */}
                <div className="border border-slate-150 rounded-xl p-5 hover:border-blue-200 transition-all flex flex-col justify-between bg-slate-50/20">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[9px] uppercase font-mono bg-blue-100/60 text-blue-700 px-1.5 py-0.5 rounded">Option A</span>
                      <span className="text-[10px] font-bold text-slate-400">SESSION BASIS</span>
                    </div>
                    <h4 className="font-bold text-gray-800 text-sm">Interactive Client Session</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                      Logs you in through a standard Google popup. This is quick and secure, but the token expires in <strong>1 hour</strong> requiring manual reconnect. Great for quick uploads!
                    </p>
                  </div>
                  <div className="mt-5 pt-4 border-t border-dashed border-slate-150">
                    <button
                      type="button"
                      onClick={handleConnectDriveTemporary}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg justify-center transition-all cursor-pointer flex items-center gap-1.5 shadow-sm text-[11px]"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Connect Standard (1 Hr)
                    </button>
                  </div>
                </div>

                {/* OPTION B: PERSISTENT CONNECT */}
                <div className="border border-slate-150 rounded-xl p-5 hover:border-emerald-200 transition-all flex flex-col justify-between bg-emerald-50/5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[9px] uppercase font-mono bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Option B (Free)</span>
                      <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">★ Recommended</span>
                    </div>
                    <h4 className="font-bold text-gray-800 text-sm">Persistent Drive Connection</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                      Integrates your own credentials on this server <strong>completely for free</strong>. The model automatically refreshes credentials for days/months so you never get logged out!
                    </p>
                  </div>
                  <div className="mt-5 pt-4 border-t border-dashed border-slate-150">
                    <div className="p-2 border border-emerald-100 bg-emerald-100/5 hover:bg-emerald-100/10 rounded-lg text-[9px] text-emerald-850 font-mono flex items-center justify-between">
                      <span>✓ Keeps app connected forever!</span>
                      <span className="font-bold">100% FREE</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* OPTION B CONFIGURATION FORM */}
              <div className="border border-emerald-100 bg-slate-50/40 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                  <Link className="h-4 w-4 text-emerald-600" />
                  <span className="font-bold text-[11px] text-slate-800 uppercase tracking-widest font-mono">Persistent Web App Configuration</span>
                </div>

                <div className="space-y-3">
                  <div className="bg-white hover:bg-emerald-50/5 p-3 rounded-lg border border-slate-200 text-[10px] leading-relaxed text-slate-600 space-y-1.5 font-sans">
                    <p className="font-bold text-slate-800 uppercase tracking-wider text-[9px]">✎ Google Cloud Console Guide:</p>
                    <ol className="list-decimal pl-3.5 space-y-1">
                      <li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline font-bold">Google API Credentials Dashboard</a>.</li>
                      <li>Create an <strong>OAuth 2.0 Web Application Client</strong> credentials (free).</li>
                      <li>Add this EXACT URL to <strong>Authorized Redirect URIs</strong>:
                        <div className="bg-slate-100 px-2 py-1 mt-1 rounded font-mono font-bold text-slate-800 break-all select-all border border-slate-200 leading-normal">
                          {window.location.origin}/api/drive/callback
                        </div>
                      </li>
                      <li>Make sure the <strong>Google Drive API</strong> is enabled in your Google Library.</li>
                      <li>Paste your credentials below to authorize persistent offline access.</li>
                    </ol>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1.5">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Google Client ID *</label>
                      <input
                        type="text"
                        value={customClientId}
                        onChange={(e) => setCustomClientId(e.target.value)}
                        placeholder="114421...apps.googleusercontent.com"
                        className="w-full bg-white border border-slate-200 placeholder-slate-350 rounded-lg p-2 font-mono text-[10px] text-slate-700 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Google Client Secret *</label>
                      <input
                        type="password"
                        value={customClientSecret}
                        onChange={(e) => setCustomClientSecret(e.target.value)}
                        placeholder="GOCSPX-..."
                        className="w-full bg-white border border-slate-200 placeholder-slate-350 rounded-lg p-2 font-mono text-[10px] text-slate-700 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleConnectDrivePersistent}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase tracking-wider rounded-lg flex items-center gap-1.5 shadow-sm transition-all text-[10px] cursor-pointer"
                  >
                    Authorize & Connect
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
