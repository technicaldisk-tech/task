import React, { useState, useEffect } from 'react';
import { Task, UserCredentials, Expense } from '../types';
import { initAuth, googleSignIn, logout } from '../lib/firebaseAuth';
import { getOrCreateFolder, uploadFileToDrive } from '../lib/googleDrive';
import { 
  Users, DollarSign, Calendar, TrendingUp, AlertTriangle, 
  Plus, Edit, Eye, Trash2, Search, Filter, Phone, MessageSquare,
  Download, FileText, CheckCircle2, ChevronRight, ChevronLeft, RefreshCw, 
  MapPin, Clock, ShieldCheck, Key, Lock, ArrowUpRight, ArrowDownLeft, X, Link, Loader2,
  Check, ArrowUpDown, ChevronDown, Bell, Database, Upload
} from 'lucide-react';

interface AdminDashboardProps {
  user: { userId: string; name: string };
  onLogout: () => void;
}

// Global Static Date Helpers to avoid initialization / hoisting issues in component hook/render loops
const formatDateToYYYYMMDD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getFileViewUrl = (file: { path: string; driveUrl?: string }): string => {
  if (file.driveUrl && file.driveUrl.startsWith('https://drive.google.com')) {
    return file.driveUrl.replace('/view', '/preview');
  }
  return file.path;
};

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

const getDaysInMonth = (year: number, month: number) => {
  return new Date(year, month + 1, 0).getDate();
};

const getFirstDayOfMonth = (year: number, month: number) => {
  return new Date(year, month, 1).getDay();
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

const ddmmToYyyymmdd = (ddmm: string) => {
  if (!ddmm) return '';
  const parts = ddmm.split('/');
  if (parts.length !== 3) return ddmm;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const yyyymmddToDdmm = (yyyymmdd: string) => {
  if (!yyyymmdd) return '';
  const parts = yyyymmdd.split('-');
  if (parts.length !== 3) return yyyymmdd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const getTodayDDMMYYYY = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export default function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resetStep, setResetStep] = useState<'idle' | 'confirm' | 'resetting'>('idle');
  
  // Google Drive Integration State
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveUser, setDriveUser] = useState<any>(null);
  const [showDriveConnectModal, setShowDriveConnectModal] = useState(false);
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [isRefreshingDrive, setIsRefreshingDrive] = useState(false);
  const [driveStatusFeedback, setDriveStatusFeedback] = useState<string | null>(null);

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
          setDriveStatusFeedback("Offline/Expired");
        }
      } else {
        setDriveStatusFeedback("Offline/Expired");
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
          }
        }
      } catch (err) {
        console.error("Failed to load Google Drive configuration:", err);
      }
    };
    fetchDriveConfig();

    const unsub = initAuth(
      (u, token) => {
        if (token) {
          setDriveToken(token);
          setDriveUser(u);
        }
      },
      () => {
        // Do not force wipe if we succeeded in loading from `/api/drive/config`
      }
    );
    return () => unsub();
  }, []);

  // Listen for message from Google persistent OAuth callback popup frame
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

  const handleConnectDrive = () => {
    setShowDriveConnectModal(true);
  };

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
      await logout();
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
  const [users, setUsers] = useState<UserCredentials[]>([]);
  const [acknowledgedFiles, setAcknowledgedFiles] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('templatesvilla_acknowledged_whatsapp');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'finance' | 'overdue' | 'ledgers' | 'users'>('tasks');

  // Search, Filters & Drill-downs
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [creatorFilter, setCreatorFilter] = useState('All');
  const [clientFilter, setClientFilter] = useState('All');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');

  // Custom Interactive Date Picker UI states
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [localStartDateStr, setLocalStartDateStr] = useState('');
  const [localEndDateStr, setLocalEndDateStr] = useState('');
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [hoveredDateStr, setHoveredDateStr] = useState('');
  const [activePreset, setActivePreset] = useState('Maximum');

  // Selected Ledger Drilldown
  const [selectedLedgerClient, setSelectedLedgerClient] = useState('');
  const [selectedLedgerCreator, setSelectedLedgerCreator] = useState('');

  // Task Modals & Creation States
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  // Task Bulk Import / Export States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsing' | 'ready' | 'importing' | 'success' | 'error'>('idle');
  const [parsedImportCount, setParsedImportCount] = useState({ created: 0, updated: 0, total: 0 });
  const [parsedTasks, setParsedTasks] = useState<any[]>([]);
  const [importLog, setImportLog] = useState<string>('');

  // Task deletion states
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  // Client editing states
  const [editingClientOriginalName, setEditingClientOriginalName] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [isClientEditModalOpen, setIsClientEditModalOpen] = useState(false);
  const [updatingClient, setUpdatingClient] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(30);

  // Confirmation state for Cleared & Paid status changes
  const [confirmAction, setConfirmAction] = useState<{
    type: 'cleared' | 'paid';
    taskId: string;
    nextValue: 'Yes' | 'No';
  } | null>(null);

  // States for inline date cell editing (unblocking stuck and static dates)
  const [editingDateCell, setEditingDateCell] = useState<{ taskId: string; type: 'deliveryDate' | 'balRecDate' | 'paidToCreatorDate' } | null>(null);
  const [inlineDateValue, setInlineDateValue] = useState<string>('');

  // Notifications System States
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showingNotifDropdown, setShowingNotifDropdown] = useState(false);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [activeToast, setActiveToast] = useState<any | null>(null);
  const lastCheckTimeRef = React.useRef<number>(Date.now());
  const seenNotifIdsRef = React.useRef<Set<string>>(new Set());

  // Function to play a premium gentle chime using standard Web Audio API (works perfectly on desktop and mobile)
  const playNotificationChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const playNote = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.12, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      const now = ctx.currentTime;
      playNote(523.25, now, 0.4); // C5
      playNote(659.25, now + 0.12, 0.5); // E5
    } catch (err) {
      console.warn("Audio chime play deferred until user gesture:", err);
    }
  };

  const fetchAndCheckNotifications = async (isInitial = false) => {
    try {
      const response = await fetch('/api/admin/notifications');
      const data = await response.json();
      if (response.ok && data.success) {
        const fetchedNotifs = data.notifications || [];
        
        if (isInitial) {
          fetchedNotifs.forEach((n: any) => seenNotifIdsRef.current.add(n.id));
          lastCheckTimeRef.current = Date.now();
        } else {
          const newUnreadNotifs = fetchedNotifs.filter((n: any) => {
            const isUnseen = !seenNotifIdsRef.current.has(n.id);
            const isUnread = !n.read;
            return isUnseen && isUnread;
          });

          if (newUnreadNotifs.length > 0) {
            // 1. Play our custom synthesized chime sound cue!
            playNotificationChime();

            // 2. Set the latest first unread notification as our active floating Toast banner
            const latestNotif = newUnreadNotifs[0];
            setActiveToast({
              id: latestNotif.id,
              uploaderName: latestNotif.uploaderName,
              taskId: latestNotif.taskId,
              videoTopic: latestNotif.videoTopic,
              uploadType: latestNotif.uploadType
            });

            // Automatically dismiss toast after 9 seconds
            setTimeout(() => {
              setActiveToast((prev: any) => (prev && prev.id === latestNotif.id ? null : prev));
            }, 9000);

            // 3. Try showing standard system push alerts (via Service Worker if Android Chrome, otherwise native Notification)
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              newUnreadNotifs.forEach((n: any) => {
                const title = n.uploadType === 'final' 
                  ? "Final Video Delivered!" 
                  : "New Sample Uploaded!";
                const body = `User: ${n.uploaderName}\nTask ID: ${n.taskId}\nVideo: ${n.videoTopic}`;
                
                // Android Chrome strictly requires a Service Worker registration to show notifications!
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.ready.then((reg) => {
                    try {
                      reg.showNotification(title, {
                        body,
                        icon: 'https://cdn-icons-png.flaticon.com/512/1179/1179069.png',
                        vibrate: [200, 100, 200],
                        tag: n.id,
                        requireInteraction: true
                      } as any);
                    } catch (e) {
                      new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/1179/1179069.png', requireInteraction: true } as any);
                    }
                  }).catch(() => {
                    new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/1179/1179069.png', requireInteraction: true } as any);
                  });
                } else {
                  try {
                    new Notification(title, {
                      body,
                      icon: 'https://cdn-icons-png.flaticon.com/512/1179/1179069.png',
                      requireInteraction: true
                    } as any);
                  } catch (e) {
                    console.error("Native fallback notification constructor error:", e);
                  }
                }
              });
            }
            newUnreadNotifs.forEach((n: any) => seenNotifIdsRef.current.add(n.id));
          }
        }
        setNotifications(fetchedNotifs);
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserNotificationsEnabled(Notification.permission === 'granted');
    }

    fetchAndCheckNotifications(true);

    const interval = setInterval(() => {
      fetchAndCheckNotifications(false);
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const handleToastAction = (toast: any) => {
    const matchingTask = tasks.find(t => t.id === toast.taskId);
    if (matchingTask) {
      setViewingTask(matchingTask);
      setActiveTab('tasks');
      setStatusFilter('All');
      setCreatorFilter('All');
      setClientFilter('All');
      setSearchTerm('');
    } else {
      setActiveTab('tasks');
      setSearchTerm(toast.taskId);
    }
    setActiveToast(null);
  };

  const handleNotificationClick = async (notification: any) => {
    try {
      const res = await fetch('/api/admin/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [notification.id] })
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n));
      }
    } catch (err) {
      console.error("Mark read error:", err);
    }

    const matchingTask = tasks.find(t => t.id === notification.taskId);
    if (matchingTask) {
      setViewingTask(matchingTask);
      setActiveTab('tasks');
      setStatusFilter('All');
      setCreatorFilter('All');
      setClientFilter('All');
      setSearchTerm('');
    } else {
      setActiveTab('tasks');
      setSearchTerm(notification.taskId);
    }
    setShowingNotifDropdown(false);
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/admin/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true })
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } catch (err) {
      console.error("Mark all read error:", err);
    }
  };

  const handleClearAllNotifications = async () => {
    try {
      const res = await fetch('/api/admin/notifications/clear', {
        method: 'POST'
      });
      if (res.ok) {
        setNotifications([]);
      }
    } catch (err) {
      console.error("Clear notifications error:", err);
    }
  };

  const toggleBrowserPushToken = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      setBrowserNotificationsEnabled(permission === 'granted');
    } else {
      alert("This browser does not support native desktop push notifications.");
    }
  };

  // New Task Fields Form
  const [taskForm, setTaskForm] = useState({
    id: '',
    clientName: '',
    clientPhone: '',
    category: '',
    videoName: '',
    scriptReady: 'No' as 'Yes' | 'No',
    price: 0,
    advance: 0,
    advReceivedDate: '',
    balance: 0, // dynamic
    balanceReceived: 'No' as 'Yes' | 'No',
    balRecDate: '',
    issuedToWhom: '',
    orderStatus: 'Pending' as any,
    paidToCreator: 'No' as 'Yes' | 'No',
    payableAmountToCreator: 0,
    paidToCreatorDate: '',
    script: '',
    deliveryDate: '',
    orderDate: ''
  });

  // User Management Forms
  const [newUserForm, setNewUserForm] = useState({ userId: '', password: '', name: '', role: 'Member' as any, phone: '' });
  const [passwordChangeForm, setPasswordChangeForm] = useState({ targetUserId: '', newPassword: '', newName: '', newPhone: '' });
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Expenses Forms
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: 0, date: '' });
  const [addingExpense, setAddingExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);

   // Sorting state for task ledger
  const [sortField, setSortField] = useState<string>('');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Auto-suggestions states for Task Creation
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);

  // Local state for attaching files during task creation or edit
  const [selectedTaskFiles, setSelectedTaskFiles] = useState<File[]>([]);
  const [uploadingTaskFiles, setUploadingTaskFiles] = useState(false);
  const [adminUploadProgress, setAdminUploadProgress] = useState<string | null>(null);

  // Reset page when filters, sorting or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, creatorFilter, clientFilter, startDateStr, endDateStr, sortField, sortAsc, pageSize]);

  const updateTaskInline = async (taskId: string, fieldsToUpdate: Partial<Task>) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fieldsToUpdate),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setTasks(data.tasks);
      } else {
        alert(data.message || 'Failed to update task.');
      }
    } catch (err) {
      console.error('Error updating task inline:', err);
      alert('An error occurred while updating the task.');
    }
  };

  const getTodaysDateStr = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleExportCSV = () => {
    if (filteredTasks.length === 0) return;
    const headers = [
      'Task ID', 'Order Date', 'Delivery Date', 'Client Name', 'Client Phone', 'Category', 'Video Topic', 
      'Script Ready', 'Rate (Price)', 'Advance Paid', 'Adv Received Date', 'Balance', 'Cleared Status', 
      'Cleared Date', 'Assignee', 'Status', 'Creator Pay', 'Creator Paid Status', 'Creator Paid Date', 'Script'
    ];
    const rows = filteredTasks.map(t => [
      t.id, t.orderDate, t.deliveryDate || '', t.clientName, t.clientPhone, t.category, t.videoName,
      t.scriptReady, t.price, t.advance, t.advReceivedDate || '', t.balance, t.balanceReceived,
      t.balRecDate || '', t.issuedToWhom, t.orderStatus, t.payableAmountToCreator, t.paidToCreator, t.paidToCreatorDate || '', t.script || ''
    ]);
    const csvContent = [headers, ...rows].map(e => e.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `templatesvilla_task_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (tasks.length === 0) return;
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      tasks: tasks
    };
    const jsonContent = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `templatesvilla_full_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCSV = (text: string) => {
    const lines: string[][] = [];
    let row: string[] = [""];
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];
      
      if (char === '"') {
        if (inQuotes && next === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push('');
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          i++;
        }
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
    
    if (lines.length < 2) return [];
    
    const rawHeaders = lines[0];
    const headers = rawHeaders.map(h => h.trim().replace(/^"|"$/g, ''));
    const result: any[] = [];
    
    const headerMap: Record<string, string> = {
      'Task ID': 'id',
      'Order Date': 'orderDate',
      'Delivery Date': 'deliveryDate',
      'Client Name': 'clientName',
      'Client Phone': 'clientPhone',
      'Category': 'category',
      'Video Topic': 'videoName',
      'Script Ready': 'scriptReady',
      'Rate (Price)': 'price',
      'Advance Paid': 'advance',
      'Adv Received Date': 'advReceivedDate',
      'Balance': 'balance',
      'Cleared Status': 'balanceReceived',
      'Cleared Date': 'balRecDate',
      'Assignee': 'issuedToWhom',
      'Status': 'orderStatus',
      'Creator Pay': 'payableAmountToCreator',
      'Creator Paid Status': 'paidToCreator',
      'Creator Paid Date': 'paidToCreatorDate',
      'Script': 'script'
    };

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i];
      if (values.length < headers.length) continue;
      if (values.every(v => v.trim() === '')) continue;

      const entry: any = {};
      headers.forEach((h, idx) => {
        const key = headerMap[h] || h;
        entry[key] = values[idx] ? values[idx].trim() : '';
      });
      result.push(entry);
    }
    return result;
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportStatus('parsing');
    setImportLog('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error("Empty file content.");

        let tasksToImport: any[] = [];
        
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          const rawList = Array.isArray(parsed) ? parsed : (parsed.tasks || parsed.data || []);
          if (!Array.isArray(rawList)) {
            throw new Error("JSON file must contain an array of tasks under 'tasks' or as the root element.");
          }
          tasksToImport = rawList;
        } else if (file.name.endsWith('.csv')) {
          tasksToImport = parseCSV(text);
          if (tasksToImport.length === 0) {
            throw new Error("Could not parse any valid task rows from CSV.");
          }
        } else {
          throw new Error("Unsupported file format. Please upload .json or .csv only.");
        }

        let created = 0;
        let updated = 0;
        tasksToImport.forEach(t => {
          let tid = t.id || t['Task ID'];
          if (tid && tasks.some(e => e.id === String(tid).trim())) {
            updated++;
          } else {
            created++;
          }
        });

        setParsedTasks(tasksToImport);
        setParsedImportCount({ created, updated, total: tasksToImport.length });
        setImportStatus('ready');
        setImportLog(`Successfully parsed ${tasksToImport.length} tasks matching layout guidelines.`);
      } catch (err: any) {
        console.error(err);
        setImportStatus('error');
        setImportLog(`Parsing failed: ${err.message || err}`);
      }
    };
    reader.onerror = () => {
      setImportStatus('error');
      setImportLog("Error reading file.");
    };
    reader.readAsText(file);
  };

  const submitImport = async () => {
    if (parsedTasks.length === 0) return;
    setImportStatus('importing');
    setImportLog('Importing tasks to database...');

    try {
      const response = await fetch('/api/tasks/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tasks: parsedTasks })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setImportStatus('success');
        setImportLog(`Successfully processed import backup! Created ${data.createdCount} new tasks, updated ${data.updatedCount} existing tasks.`);
        setTasks(data.tasks);
      } else {
        throw new Error(data.message || 'Import failed at API handoff.');
      }
    } catch (err: any) {
      console.error(err);
      setImportStatus('error');
      setImportLog(`Database import failed: ${err.message || err}`);
    }
  };

  const handleResetDatabase = async () => {
    if (resetStep === 'idle') {
      setResetStep('confirm');
      return;
    }
    setResetStep('resetting');
    try {
      const response = await fetch('/api/tasks/clear-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setTasks([]);
        setExpenses([]);
        setResetStep('idle');
        setIsImportModalOpen(false);
      } else {
        throw new Error(data.message || 'System clear failed.');
      }
    } catch (err: any) {
      console.error(err);
      alert(`Wipeout failed: ${err.message || err}`);
      setResetStep('idle');
    }
  };

  // Load all server info
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [tasksRes, usersRes, expRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/users'),
        fetch('/api/expenses')
      ]);

      const tasksData = await tasksRes.json();
      const usersData = await usersRes.json();
      const expData = await expRes.json();

      if (tasksRes.ok && tasksData.success) setTasks(tasksData.tasks);
      if (usersRes.ok && usersData.success) setUsers(usersData.users);
      if (expRes.ok && expData.success) setExpenses(expData.expenses);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Sync Category Suggestions
  const existingCategories = Array.from(new Set(tasks.map(t => t.category).filter(Boolean))) as string[];
  // Sync Client Suggestions for Auto-Complete
  const existingClientsMap = tasks.reduce((acc, t) => {
    if (t.clientName && !acc[t.clientName]) {
      acc[t.clientName] = t.clientPhone || '919999999999';
    }
    return acc;
  }, {} as Record<string, string>);
  const uniqueClientNames = Object.keys(existingClientsMap);

  // Global date utilities are now defined at the top of the module to avoid hoisting and render re-evaluation issues.

  // Main filter for tasks
  const filteredTasks = tasks.filter(task => {
    // Search query on Client, Creator, Category, Video Name, ID
    const matchesSearch = 
      task.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.videoName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.issuedToWhom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'All' || task.orderStatus === statusFilter;
    const matchesCreator = creatorFilter === 'All' || task.issuedToWhom === creatorFilter;
    const matchesClient = clientFilter === 'All' || task.clientName === clientFilter;

    // Date range filtering (Order Date)
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

    return matchesSearch && matchesStatus && matchesCreator && matchesClient && matchesDate;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Custom Date Filter Selection Helpers and Handlers
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

  const handleDayClick = (dateStr: string) => {
    if (!localStartDateStr || (localStartDateStr && localEndDateStr)) {
      setLocalStartDateStr(dateStr);
      setLocalEndDateStr('');
      setActivePreset('Custom');
    } else {
      if (dateStr < localStartDateStr) {
        setLocalStartDateStr(dateStr);
      } else {
        setLocalEndDateStr(dateStr);
      }
      setActivePreset('Custom');
    }
  };

  const handlePresetSelect = (preset: string) => {
    const { startStr, endStr } = getPresetRange(preset);
    setLocalStartDateStr(startStr);
    setLocalEndDateStr(endStr);
    setActivePreset(preset);

    if (startStr) {
      const parts = startStr.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      setViewYear(y);
      setViewMonth(m);
    }
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const renderCalendarMonth = (year: number, month: number) => {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const cells: React.ReactNode[] = [];
    
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      const isStart = localStartDateStr === dStr;
      const isEnd = localEndDateStr === dStr;
      
      let isSelectedRange = false;
      let isInHoverRange = false;
      
      if (localStartDateStr && localEndDateStr) {
        isSelectedRange = dStr >= localStartDateStr && dStr <= localEndDateStr;
      } else if (localStartDateStr && hoveredDateStr) {
        isInHoverRange = dStr >= localStartDateStr && dStr <= hoveredDateStr;
      }
      
      const isToday = formatDateToYYYYMMDD(new Date()) === dStr;
      
      let cellBgClass = 'text-slate-700 hover:bg-slate-100 rounded-lg';
      let textWeightClass = 'font-semibold';
      
      if (isStart && isEnd) {
        cellBgClass = 'bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-3xs z-10';
        textWeightClass = 'font-bold';
      } else if (isStart) {
        cellBgClass = 'bg-blue-600 text-white rounded-l-lg hover:bg-blue-700 shadow-3xs z-10';
        textWeightClass = 'font-bold';
      } else if (isEnd) {
        cellBgClass = 'bg-blue-600 text-white rounded-r-lg hover:bg-blue-700 shadow-3xs z-10';
        textWeightClass = 'font-bold';
      } else if (isSelectedRange) {
        cellBgClass = 'bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-none';
      } else if (isInHoverRange) {
        cellBgClass = 'bg-blue-50/70 text-blue-600 hover:bg-blue-100 rounded-none';
      } else if (isToday) {
        cellBgClass = 'bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-bold';
      }
      
      cells.push(
        <button
          key={`day-${day}`}
          type="button"
          onClick={() => handleDayClick(dStr)}
          onMouseEnter={() => {
            if (localStartDateStr && !localEndDateStr) {
              setHoveredDateStr(dStr);
            }
          }}
          className={`h-8 w-8 text-xs flex items-center justify-center cursor-pointer transition-all ${cellBgClass} ${textWeightClass}`}
        >
          {day}
        </button>
      );
    }
    
    return (
      <div className="flex-1 min-w-[210px] space-y-3">
        <div className="text-center font-bold text-xs text-slate-800 flex items-center justify-center gap-1">
          {monthNames[month]} {year}
        </div>
        
        <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] font-bold text-slate-400">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>
        
        <div className="grid grid-cols-7 gap-y-1 justify-items-center animate-fade-in">
          {cells}
        </div>
      </div>
    );
  };

  const sortedTasks = [...filteredTasks];
  if (!sortField) {
    // Default to descending order (newest first / newly created at the top)
    sortedTasks.reverse();
  } else {
    sortedTasks.sort((a, b) => {
      let aVal = a[sortField as keyof Task];
      let bVal = b[sortField as keyof Task];

      if (aVal === undefined || aVal === null) aVal = '';
      if (bVal === undefined || bVal === null) bVal = '';

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal === bVal) return 0;

      if (sortAsc) {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }

  // Pagination Calculations
  const totalTasks = sortedTasks.length;
  const isPaginationActive = totalTasks > 30;
  const totalPages = isPaginationActive ? Math.ceil(totalTasks / pageSize) : 1;
  const paginatedTasks = isPaginationActive 
    ? sortedTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedTasks;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisibleNeighbors = 1;

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - maxVisibleNeighbors && i <= currentPage + maxVisibleNeighbors)
      ) {
        pages.push(i);
      } else if (
        i === 2 && currentPage > 1 + maxVisibleNeighbors + 1
      ) {
        pages.push('...');
      } else if (
        i === totalPages - 1 && currentPage < totalPages - maxVisibleNeighbors - 1
      ) {
        pages.push('...');
      }
    }

    const filteredPages: (number | string)[] = [];
    for (let idx = 0; idx < pages.length; idx++) {
      if (pages[idx] === '...' && filteredPages[filteredPages.length - 1] === '...') {
        continue;
      }
      filteredPages.push(pages[idx]);
    }
    return filteredPages;
  };

  // Dynamic Financial Totals based on dynamic filters!
  const grossBillings = filteredTasks.reduce((sum, t) => sum + (t.price || 0), 0);
  const totalAdvance = filteredTasks.reduce((sum, t) => sum + (t.advance || 0), 0);
  const totalBalancePaid = filteredTasks.reduce((sum, t) => sum + (t.balanceReceived === 'Yes' ? (t.balance || 0) : 0), 0);
  
  // Overdue calculation: clients outstanding balance
  // Client balance is unpaid outstanding if balanceReceived is No
  const outstandingOverdue = filteredTasks.reduce((sum, t) => {
    if (t.balanceReceived === 'No') {
      return sum + (t.balance || 0);
    }
    return sum;
  }, 0);

  const creatorLiability = filteredTasks.reduce((sum, t) => {
    if (t.paidToCreator === 'No') {
      return sum + (t.payableAmountToCreator || 0);
    }
    return sum;
  }, 0);

  const filteredExpenses = expenses.filter(exp => {
    let matchesDate = true;
    const expDateObj = parseDDMMYYYY(exp.date);
    if (expDateObj) {
      const expYMD = formatDateToYYYYMMDD(expDateObj);
      if (startDateStr && expYMD < startDateStr) {
        matchesDate = false;
      }
      if (endDateStr && expYMD > endDateStr) {
        matchesDate = false;
      }
    }
    return matchesDate;
  });

  const totalOtherExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  // Margin = Product price/Gross billings - Creator pay liabilities - Expenses
  const projectedMargin = grossBillings - filteredTasks.reduce((sum, t) => sum + (t.payableAmountToCreator || 0), 0) - totalOtherExpenses;

  // Age calculation details helper based on Anchor time 28/05/2026
  const anchorTime = new Date('2026-05-28');
  const getOverdueDateDays = (task: Task) => {
    // Count from task completion date (deliveryDate), fallback to orderDate if deliveryDate is not set
    const dateStr = task.deliveryDate || task.orderDate;
    const d = parseDDMMYYYY(dateStr);
    if (!d) return 0;
    const diffTime = anchorTime.getTime() - d.getTime();
    const diffDays = Math.floor(diffTime / (1024 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // Grouped Clients Overdue Aging reports with updated intervals: 0-2 DAYS, 3-5 DAYS, and 6-10+ DAYS
  const clientOverdueReports = tasks.reduce((acc, t) => {
    if (t.balanceReceived === 'No' && (t.price - t.advance) > 0) {
      const client = t.clientName;
      const days = getOverdueDateDays(t);
      const bal = t.balance || (t.price - t.advance);
      
      if (!acc[client]) {
        acc[client] = {
          clientName: client,
          totalBilled: 0,
          totalPaid: 0,
          overdueBal: 0,
          aging0_2: 0,
          aging3_5: 0,
          aging6Plus: 0,
          overdueTasksCount: 0
        };
      }

      acc[client].overdueTasksCount += 1;
      acc[client].overdueBal += bal;

      if (days <= 2) {
        acc[client].aging0_2 += bal;
      } else if (days <= 5) {
        acc[client].aging3_5 += bal;
      } else {
        acc[client].aging6Plus += bal;
      }
    }
    return acc;
  }, {} as Record<string, {
    clientName: string;
    totalBilled: number;
    totalPaid: number;
    overdueBal: number;
    aging0_2: number;
    aging3_5: number;
    aging6Plus: number;
    overdueTasksCount: number;
  }>);

  // Fill in complete billing details for overdue clients reports
  Object.keys(clientOverdueReports).forEach((client) => {
    const clientTasks = tasks.filter(t => t.clientName === client);
    const billed = clientTasks.reduce((sum, t) => sum + t.price, 0);
    const paid = clientTasks.reduce((sum, t) => sum + t.advance + (t.balanceReceived === 'Yes' ? t.balance : 0), 0);
    clientOverdueReports[client].totalBilled = billed;
    clientOverdueReports[client].totalPaid = paid;
  });

  const overdueClientsList = Object.values(clientOverdueReports) as Array<{
    clientName: string;
    totalBilled: number;
    totalPaid: number;
    overdueBal: number;
    aging0_2: number;
    aging3_5: number;
    aging6Plus: number;
    overdueTasksCount: number;
  }>;

  // Grouped Creators Overdue Aging reports with updated intervals: 0-2 DAYS, 3-5 DAYS, and 6-10+ DAYS
  const creatorLiabilityReports = tasks.reduce((acc, t) => {
    const creator = (t.issuedToWhom || '').trim();
    if (creator && t.paidToCreator === 'No' && (t.payableAmountToCreator || 0) > 0) {
      const days = getOverdueDateDays(t);
      const bal = t.payableAmountToCreator || 0;
      
      if (!acc[creator]) {
        acc[creator] = {
          creatorName: creator,
          totalEarned: 0,
          totalPaid: 0,
          overdueBal: 0,
          aging0_2: 0,
          aging3_5: 0,
          aging6Plus: 0,
          overdueTasksCount: 0
        };
      }

      acc[creator].overdueTasksCount += 1;
      acc[creator].overdueBal += bal;

      if (days <= 2) {
        acc[creator].aging0_2 += bal;
      } else if (days <= 5) {
        acc[creator].aging3_5 += bal;
      } else {
        acc[creator].aging6Plus += bal;
      }
    }
    return acc;
  }, {} as Record<string, {
    creatorName: string;
    totalEarned: number;
    totalPaid: number;
    overdueBal: number;
    aging0_2: number;
    aging3_5: number;
    aging6Plus: number;
    overdueTasksCount: number;
  }>);

  // Fill in complete payout details for creators that have outstanding liability
  Object.keys(creatorLiabilityReports).forEach((creator) => {
    const creatorTasks = tasks.filter(t => (t.issuedToWhom || '').trim() === creator);
    const earned = creatorTasks.reduce((sum, t) => sum + (t.payableAmountToCreator || 0), 0);
    const paid = creatorTasks.reduce((sum, t) => sum + (t.paidToCreator === 'Yes' ? (t.payableAmountToCreator || 0) : 0), 0);
    creatorLiabilityReports[creator].totalEarned = earned;
    creatorLiabilityReports[creator].totalPaid = paid;
  });

  const overdueCreatorsList = Object.values(creatorLiabilityReports) as Array<{
    creatorName: string;
    totalEarned: number;
    totalPaid: number;
    overdueBal: number;
    aging0_2: number;
    aging3_5: number;
    aging6Plus: number;
    overdueTasksCount: number;
  }>;

  // Save or Add creator account logic
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.userId.trim() || !newUserForm.password.trim()) return;

    try {
      const response = await fetch('/api/users/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.userId,
          userId: newUserForm.userId.trim(),
          password: newUserForm.password.trim(),
          name: newUserForm.name.trim() || newUserForm.userId.trim(),
          role: newUserForm.role,
          phone: newUserForm.phone.trim()
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setUsers(data.users);
        setIsAddingUser(false);
        setNewUserForm({ userId: '', password: '', name: '', role: 'Member', phone: '' });
      } else {
        alert(data.message || 'Error occurred adding user.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Change Admin or Creator password credentials
  const handleUpdateUserCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordChangeForm.targetUserId) return;

    try {
      const response = await fetch('/api/auth/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentUserId: user.userId,
          targetUserId: passwordChangeForm.targetUserId,
          newPassword: passwordChangeForm.newPassword || undefined,
          newName: passwordChangeForm.newName || undefined,
          newPhone: passwordChangeForm.newPhone || undefined
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setUsers(data.users);
        alert('Credentials updated successfully.');
        setPasswordChangeForm({ targetUserId: '', newPassword: '', newName: '', newPhone: '' });
      } else {
        alert(data.message || 'Failed to update credentials.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete User Account
  const handleDeleteUser = async (targetUserId: string) => {
    const isConfirmed = window.confirm(`Permanently delete account ${targetUserId}? This action cannot be reverted.`);
    if (!isConfirmed) return;

    try {
      const response = await fetch('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.userId,
          targetUserId
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setUsers(data.users);
      } else {
        alert(data.message || 'Failed to delete account.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Task creation
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = !!editingTask;
    const url = isEdit ? `/api/tasks/${editingTask?.id}` : '/api/tasks';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskForm),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        let finalTasks = data.tasks;

        // Perform attachment files upload if any are selected
        if (selectedTaskFiles.length > 0) {
          setUploadingTaskFiles(true);
          
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
            console.error("Admin just-in-time token update error:", confErr);
          }

          if (activeToken) {
            try {
              // 1. Get or create root folder
              const rootId = await getOrCreateFolder(activeToken, "Templatesvilla Ledger Docs");
              // 2. Get or create sample files folder under root
              const sampleFolderId = await getOrCreateFolder(activeToken, "Sample Reference Files", rootId);
              
              const totalFiles = selectedTaskFiles.length;
              let uploadedCount = 0;
              let lastProgresses: Record<string, string> = {};
              const updateOverallProgress = () => {
                if (totalFiles === 1) {
                  const keys = Object.keys(lastProgresses);
                  setAdminUploadProgress(keys.length > 0 ? `Drive: ${lastProgresses[keys[0]]}` : "Uploading to Drive...");
                } else {
                  const percentageSummary = Object.entries(lastProgresses).map(([_, progress]) => progress).join(', ');
                  setAdminUploadProgress(`Drive ${uploadedCount}/${totalFiles} (${percentageSummary})`);
                }
              };

              // 3. Upload all files parallelly to Google Drive
              const uploadPromises = selectedTaskFiles.map(async (file) => {
                const result = await uploadFileToDrive(activeToken, file, sampleFolderId, undefined, (progressStr) => {
                  lastProgresses[file.name] = progressStr;
                  updateOverallProgress();
                });
                uploadedCount++;
                updateOverallProgress();
                return { name: file.name, url: result.webViewLink };
              });
              
              const uploadResults = await Promise.all(uploadPromises);
              uploadResults.forEach(res => {
                driveUrlsMapping[res.name] = res.url;
              });
            } catch (driveErr: any) {
              console.error("Failed to upload files to Google Drive, initiating background live force token refresh autocheck:", driveErr);
              // Attempt immediate token self-healing refresh
              try {
                const forceRes = await fetch('/api/drive/config?forceRefresh=true');
                const forceData = await forceRes.json();
                if (forceRes.ok && forceData.success && forceData.connected) {
                  const freshToken = forceData.config.accessToken;
                  setDriveToken(freshToken);
                  setDriveUser(forceData.config.user);
                  console.log("Admin token successfully force-renewed. Retrying Google Drive upload sequence...");
                  
                  const rootId = await getOrCreateFolder(freshToken, "Templatesvilla Ledger Docs");
                  const sampleFolderId = await getOrCreateFolder(freshToken, "Sample Reference Files", rootId);
                  
                  const totalFiles = selectedTaskFiles.length;
                  let uploadedCount = 0;
                  let lastProgresses: Record<string, string> = {};
                  const updateOverallProgress = () => {
                    if (totalFiles === 1) {
                      const keys = Object.keys(lastProgresses);
                      setAdminUploadProgress(keys.length > 0 ? `Drive: ${lastProgresses[keys[0]]}` : "Uploading to Drive...");
                    } else {
                      const percentageSummary = Object.entries(lastProgresses).map(([_, progress]) => progress).join(', ');
                      setAdminUploadProgress(`Drive ${uploadedCount}/${totalFiles} (${percentageSummary})`);
                    }
                  };

                  const uploadPromises = selectedTaskFiles.map(async (file) => {
                    const result = await uploadFileToDrive(freshToken, file, sampleFolderId, undefined, (progressStr) => {
                      lastProgresses[file.name] = progressStr;
                      updateOverallProgress();
                    });
                    uploadedCount++;
                    updateOverallProgress();
                    return { name: file.name, url: result.webViewLink };
                  });
                  
                  const uploadResults = await Promise.all(uploadPromises);
                  uploadResults.forEach(res => {
                    driveUrlsMapping[res.name] = res.url;
                  });
                  console.log("Admin auto-retry upload sequence succeeded!");
                } else {
                  console.warn("Could not force refresh token during auto-heal, proceeding with standard file service fallback.");
                }
              } catch (retryErr) {
                console.error("Admin auto-retry upload failed completely:", retryErr);
              }
            }
          }

          if (activeToken && Object.keys(driveUrlsMapping).length > 0) {
            try {
              const metadataFiles = selectedTaskFiles.map(file => ({
                name: file.name,
                size: file.size,
                driveUrl: driveUrlsMapping[file.name] || ""
              }));

              const uploadRes = await fetch(`/api/upload/sample?taskId=${data.task.id}&uploadedBy=Admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metadataFiles }),
              });
              const uploadData = await uploadRes.json();
              if (uploadRes.ok && uploadData.success) {
                finalTasks = finalTasks.map((t: any) => t.id === data.task.id ? uploadData.task : t);
              } else {
                alert(uploadData.message || 'Saved task info but failed to record some chosen attachments.');
              }
            } catch (uploadErr) {
              console.error('Recording file metadata during task creation failed', uploadErr);
              alert('Saved task info, but reference file recording failed.');
            } finally {
              setUploadingTaskFiles(false);
            }
          } else {
            // Direct fallback server upload
            const tooLargeFile = selectedTaskFiles.find(file => file.size > 1000 * 1024 * 1024);
            if (tooLargeFile) {
              alert(`The file "${tooLargeFile.name}" is larger than 1000MB (1 GB). Direct server uploads have a size limit under server infrastructure settings. Please compress the file or connect your Google Drive to unlock seamless ultra-large file transfers!`);
              setUploadingTaskFiles(false);
              setTasks(finalTasks);
              setIsTaskModalOpen(false);
              setEditingTask(null);
              setSelectedTaskFiles([]);
              return;
            }

            try {
              let updatedTask = data.task;
              for (const file of selectedTaskFiles) {
                if (file.size > 10 * 1024 * 1024) {
                  // Large file: chunked upload with live progress tracking
                  setAdminUploadProgress("Initializing...");
                  const chunkRes = await uploadFileInChunks(
                    file,
                    data.task.id,
                    'sample',
                    'Admin',
                    '',
                    user.name,
                    (progressStr) => setAdminUploadProgress(progressStr)
                  );
                  if (chunkRes && chunkRes.success) {
                    updatedTask = chunkRes.task;
                  }
                } else {
                  // Small file: standard upload
                  setAdminUploadProgress("Uploading...");
                  const formData = new FormData();
                  formData.append('files', file);
                  const uploadRes = await fetch(`/api/upload/sample?taskId=${data.task.id}&uploadedBy=Admin`, {
                    method: 'POST',
                    body: formData,
                  });
                  const singleRes = await uploadRes.json();
                  if (uploadRes.ok && singleRes.success) {
                    updatedTask = singleRes.task;
                  } else {
                    throw new Error(singleRes.message || "Failed to upload reference file.");
                  }
                }
              }
              finalTasks = finalTasks.map((t: any) => t.id === data.task.id ? updatedTask : t);
            } catch (uploadErr: any) {
              console.error("Direct fallback upload during task creation failed:", uploadErr);
              alert(`References saved but some attachments failed: ${uploadErr.message || uploadErr}`);
            } finally {
              setUploadingTaskFiles(false);
              setAdminUploadProgress(null);
            }
          }
        }

        setTasks(finalTasks);
        setIsTaskModalOpen(false);
        setEditingTask(null);
        setSelectedTaskFiles([]);
        // Reset form
        setTaskForm({
          id: '', clientName: '', clientPhone: '', category: '', videoName: '',
          scriptReady: 'No', price: 0, advance: 0, advReceivedDate: '', balance: 0,
          balanceReceived: 'No', balRecDate: '', issuedToWhom: '', orderStatus: 'Pending',
          paidToCreator: 'No', payableAmountToCreator: 0, paidToCreatorDate: '', script: '', deliveryDate: '',
          orderDate: ''
        });
      } else {
        alert(data.message || 'Failed to save task.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClientOriginalName || !newClientName.trim()) return;

    setUpdatingClient(true);
    try {
      const response = await fetch('/api/clients/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldName: editingClientOriginalName,
          newName: newClientName.trim(),
          newPhone: newClientPhone.trim()
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setTasks(data.tasks);
        if (selectedLedgerClient === editingClientOriginalName) {
          setSelectedLedgerClient(newClientName.trim());
        }
        setIsClientEditModalOpen(false);
        setEditingClientOriginalName(null);
      } else {
        alert(data.message || 'Failed to update client.');
      }
    } catch (err: any) {
      console.error(err);
      alert('Error updating client: ' + err.message);
    } finally {
      setUpdatingClient(false);
    }
  };

  const handleDeleteTaskConfirm = async () => {
    if (!taskToDelete) return;
    setIsDeletingTask(true);
    try {
      const res = await fetch(`/api/tasks/${taskToDelete.id}`, { method: 'DELETE' });
      const delData = await res.json();
      if (res.ok && delData.success) {
        setTasks(delData.tasks);
        setTaskToDelete(null);
      } else {
        alert(delData.message || 'Failed to delete task.');
      }
    } catch (err: any) {
      console.error(err);
      alert('Error deleting task: ' + err.message);
    } finally {
      setIsDeletingTask(false);
    }
  };

  // Trigger editing a task
  const handleEditClick = (task: Task) => {
    setEditingTask(task);
    setSelectedTaskFiles([]);
    setTaskForm({
      id: task.id,
      clientName: task.clientName,
      clientPhone: task.clientPhone,
      category: task.category,
      videoName: task.videoName,
      scriptReady: task.scriptReady,
      price: task.price,
      advance: task.advance,
      advReceivedDate: task.advReceivedDate || '',
      balance: task.balance,
      balanceReceived: task.balanceReceived,
      balRecDate: task.balRecDate || '',
      issuedToWhom: task.issuedToWhom,
      orderStatus: task.orderStatus,
      paidToCreator: task.paidToCreator,
      payableAmountToCreator: task.payableAmountToCreator,
      paidToCreatorDate: task.paidToCreatorDate || '',
      script: task.script || '',
      deliveryDate: task.deliveryDate || '',
      orderDate: task.orderDate || ''
    });
    setIsTaskModalOpen(true);
  };

  // Add / Edit Expenses Item
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.description.trim() || expenseForm.amount <= 0) return;

    try {
      const url = editingExpenseId ? `/api/expenses/${editingExpenseId}` : '/api/expenses';
      const method = editingExpenseId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expenseForm),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setExpenses(data.expenses);
        setExpenseForm({ description: '', amount: 0, date: '' });
        setAddingExpense(false);
        setEditingExpenseId(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteExpense = (id: string) => {
    const exp = expenses.find((e) => e.id === id);
    if (exp) {
      setExpenseToDelete(exp);
    }
  };

  const handleDeleteExpenseConfirm = async () => {
    if (!expenseToDelete) return;
    setIsDeletingExpense(true);
    try {
      const response = await fetch(`/api/expenses/${expenseToDelete.id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setExpenses(data.expenses);
        setExpenseToDelete(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeletingExpense(false);
    }
  };

  // WhatsApp click handler
  const triggerWhatsApp = (phone: string, task?: Task) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    let text = "Dear Client, this is an automated update regarding your video project with Templatesvilla. Please review the status of your order.";

    if (task) {
      // Find the absolute latest uploaded file across sampleFiles and finalVideos (excluding Admin briefs/references)
      let latestFile: { file: any; section: 'sample' | 'final' } | null = null;
      let latestTime = 0;

      if (task.sampleFiles && task.sampleFiles.length > 0) {
        task.sampleFiles.forEach((file) => {
          if (file.uploadedBy !== 'Admin') {
            const t = new Date(file.uploadedAt).getTime();
            if (t > latestTime) {
              latestTime = t;
              latestFile = { file, section: 'sample' };
            }
          }
        });
      }

      if (task.finalVideos && task.finalVideos.length > 0) {
        task.finalVideos.forEach((file) => {
          if (file.uploadedBy !== 'Admin') {
            const t = new Date(file.uploadedAt).getTime();
            if (t > latestTime) {
              latestTime = t;
              latestFile = { file, section: 'final' };
            }
          }
        });
      }

      if (latestFile) {
        let fileLink = (latestFile as any).file.driveUrl || (latestFile as any).file.path || '';
        if (fileLink && !fileLink.startsWith('http')) {
          fileLink = `${window.location.origin}${fileLink}`;
        }

        if ((latestFile as any).section === 'sample') {
          text = `Hello Sir/Madam,

We have sent you the samples for your requested video ${task.videoName}

Link: ${fileLink}

Please review and let us know if we should proceed.`;
        } else {
          text = `Hello Sir/Madam,

We have sent the final video output for your requested video ${task.videoName}


Link: ${fileLink}

Please review and let us know your feedback.`;
        }

        // Acknowledge this file
        const updated = { ...acknowledgedFiles, [task.id]: (latestFile as any).file.id };
        setAcknowledgedFiles(updated);
        try {
          localStorage.setItem('templatesvilla_acknowledged_whatsapp', JSON.stringify(updated));
        } catch (e) {
          console.error(e);
        }
      }
    }

    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/${cleanPhone || '919999999999'}?text=${encodedText}`, '_blank');
  };

  const shouldShowWhatsAppIndicator = (task: Task): boolean => {
    let latestFile: any = null;
    let latestTime = 0;

    if (task.sampleFiles && task.sampleFiles.length > 0) {
      task.sampleFiles.forEach((file) => {
        if (file.uploadedBy !== 'Admin') {
          const t = new Date(file.uploadedAt).getTime();
          if (t > latestTime) {
            latestTime = t;
            latestFile = file;
          }
        }
      });
    }

    if (task.finalVideos && task.finalVideos.length > 0) {
      task.finalVideos.forEach((file) => {
        if (file.uploadedBy !== 'Admin') {
          const t = new Date(file.uploadedAt).getTime();
          if (t > latestTime) {
            latestTime = t;
            latestFile = file;
          }
        }
      });
    }

    if (!latestFile) {
      return false;
    }

    const ackFileId = acknowledgedFiles[task.id];
    return ackFileId !== latestFile.id;
  };

  // WhatsApp helper to send task notification to the assigned user/creator
  const triggerWhatsAppToCreator = (task: Task) => {
    if (!task.issuedToWhom) {
      alert("This task is currently unassigned! Please assign it to a team member first.");
      return;
    }

    // Find user by userId or name
    const matchingUser = users.find(
      (u) =>
        u.userId.toLowerCase() === task.issuedToWhom.toLowerCase() ||
        u.name.toLowerCase() === task.issuedToWhom.toLowerCase()
    );

    const userName = matchingUser ? matchingUser.name : task.issuedToWhom;
    const userPhone = matchingUser?.phone;

    if (!userPhone) {
      alert(`No phone number found for "${userName}". Please configure their phone number in the Team Passwords Directory (under settings/users tab).`);
      return;
    }

    const cleanPhone = userPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      alert(`The phone number configured for "${userName}" is invalid. Please check and correct it in the Team Passwords Directory.`);
      return;
    }

    const taskID = task.id;
    const videoTopic = task.videoName;

    const text = `Hello ${userName},

You’ve received a new task.

Task ID: ${taskID}
Video Topic: ${videoTopic}

Please send the samples ASAP.`;

    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, '_blank');
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col font-sans relative">
      {/* Real-time Toast Visual & Audible Banner Overlay */}
      {activeToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-sm sm:max-w-md px-4 pointer-events-auto transition-all duration-300 animate-in fade-in slide-in-from-top-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4 shadow-2xl flex gap-3 text-white backdrop-blur-md relative overflow-hidden ring-4 ring-blue-500/20">
            {/* Soft decorative background pulse accent */}
            <div className="absolute -right-12 -top-12 w-24 h-24 bg-blue-500 rounded-full opacity-20 blur-2xl animate-pulse"></div>
            
            <div className="mt-0.5 shrink-0">
              {activeToast.uploadType === 'final' ? (
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 font-black text-xs ring-1 ring-emerald-500/30">
                  FINAL
                </span>
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 font-black text-xs ring-1 ring-blue-500/30">
                  SMPL
                </span>
              )}
            </div>
            
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black tracking-wider text-blue-400 uppercase">
                  ⚡ Live Upload Alert
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  just now
                </span>
              </div>
              <p className="text-xs font-bold text-slate-200">
                <strong className="text-white font-black">{activeToast.uploaderName}</strong> uploaded a {activeToast.uploadType === 'final' ? 'final file' : 'sample files'}!
              </p>
              <div className="text-[11px] font-medium text-slate-300 bg-slate-800 border border-slate-700/50 p-2.5 rounded-lg flex items-center justify-between mt-2 hover:bg-slate-800/85 transition-all">
                <div className="truncate pr-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase block leading-none mb-0.5">Task ID: {activeToast.taskId}</span>
                  <span className="text-xs font-black text-slate-100 truncate block">Topic: {activeToast.videoTopic}</span>
                </div>
                <button
                  onClick={() => handleToastAction(activeToast)}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-2.5 py-1.5 rounded-md font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95 flex items-center gap-1 shrink-0 shadow-sm shadow-blue-900"
                >
                  Inspect <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>
            
            <button
              onClick={() => setActiveToast(null)}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer self-start p-1 bg-slate-800/50 rounded-lg hover:bg-slate-800 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Sticky Header Nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-4 sm:px-6 lg:px-8 py-3.5 shadow-sm">
        <div className="max-w-full mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-sm shadow-sm">
              TV
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">ADMIN SECURITY ACCESS PORTAL</span>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">Templatesvilla Admin Control Center</h1>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                activeTab === 'tasks' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tasks Registry
            </button>
            <button
              onClick={() => setActiveTab('finance')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                activeTab === 'finance' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Financial Stats
            </button>
            <button
              onClick={() => setActiveTab('overdue')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                activeTab === 'overdue' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Overdue Tracker
            </button>
            <button
              onClick={() => setActiveTab('ledgers')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                activeTab === 'ledgers' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Ledgers
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                activeTab === 'users' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Team & Accounts
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>
            
            {/* Real-time Web Push Upload Alerts Center */}
            <div className="relative">
              <button
                onClick={() => setShowingNotifDropdown(!showingNotifDropdown)}
                className={`p-2.5 rounded-lg relative cursor-pointer transition-all ${
                  showingNotifDropdown 
                    ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-xs' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent hover:text-slate-900'
                }`}
                title="Activity Notifications"
              >
                <Bell className="h-4.5 w-4.5" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white animate-pulse">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>

              {/* Notifications Tray Popover */}
              {showingNotifDropdown && (
                <div className="absolute right-0 mt-2.5 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden divide-y divide-slate-150 animate-in fade-in slide-in-from-top-2 duration-155">
                  <div className="p-3.5 bg-slate-50 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Video Upload Notifications</h3>
                      <p className="text-[10px] font-medium text-slate-400">Pushed live when creators upload work</p>
                    </div>
                    <button
                      onClick={toggleBrowserPushToken}
                      className={`text-[9px] font-bold px-2 py-1 rounded-md transition-all cursor-pointer ${
                        browserNotificationsEnabled 
                          ? 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-100' 
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100'
                      }`}
                    >
                      {browserNotificationsEnabled ? '● Desktop Alert On' : 'Enable Desktop alert'}
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 space-y-1">
                        <Bell className="h-8 w-8 mx-auto opacity-30 animate-bounce" />
                        <p className="text-[11px] font-bold text-slate-700">All clear!</p>
                        <p className="text-[10px]/normal text-slate-400">No recent creator video uploads or actions reported.</p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`p-3.5 text-left cursor-pointer transition-all hover:bg-slate-50 flex gap-3 ${
                            !n.read ? 'bg-blue-50/40 border-l-2 border-blue-500' : ''
                          }`}
                        >
                          <div className="mt-0.5">
                            {n.uploadType === 'final' ? (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                F
                              </span>
                            ) : (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]">
                                S
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-slate-800 max-w-[150px] truncate">
                                {n.uploaderName}
                              </span>
                              <span className="text-[9px] font-semibold text-slate-400">
                                {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[11px] font-semibold text-slate-600 leading-normal">
                              Uploaded {n.uploadType === 'final' ? 'final video output' : 'sample/reference file'} for{' '}
                              <strong className="text-slate-900">{n.taskId}</strong>
                            </p>
                            <p className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md inline-block max-w-full truncate">
                              Topic: {n.videoTopic}
                            </p>
                            {n.fileNames && n.fileNames.length > 0 && (
                              <p className="text-[9px] font-medium text-slate-400 italic truncate">
                                File: {n.fileNames.join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <div className="p-2 bg-slate-50 flex items-center justify-between text-[10px] font-bold">
                      <button
                        onClick={handleMarkAllRead}
                        className="text-blue-600 hover:text-blue-800 hover:underline px-2 py-1 cursor-pointer"
                      >
                        Mark all as read
                      </button>
                      <button
                        onClick={handleClearAllNotifications}
                        className="text-red-600 hover:text-red-800 hover:underline px-2 py-1 cursor-pointer"
                      >
                        Clear History
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>
            <button 
              onClick={onLogout}
              className="text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-100/60 px-3.5 py-2 rounded-lg cursor-pointer transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        
        {/* Core KPIs Bar - dynamically updates based on active filters in real-time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="admin-billings-kpis-bar">
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Billings (Filtered)</span>
              <div className="p-2 bg-green-50 text-green-700 rounded-lg">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 font-mono">₹{grossBillings.toLocaleString()}</p>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 font-mono">
                <span>Adv: ₹{totalAdvance.toLocaleString()}</span>
                <span>Bal paid: ₹{totalBalancePaid.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clients Unresolved Overdue</span>
              <div className="p-2 bg-red-50 text-red-700 rounded-lg">
                <AlertTriangle className="h-4 w-4 animate-pulse" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600 font-mono">₹{outstandingOverdue.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">Pending in cash collections</p>
            </div>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Creator Liability</span>
              <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 font-mono">₹{creatorLiability.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">Due for work payouts</p>
            </div>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Projected Profit Margin</span>
              <div className="p-2 bg-purple-50 text-purple-700 rounded-lg">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 font-mono">₹{projectedMargin.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">Less Expenses: ₹{totalOtherExpenses}</p>
            </div>
          </div>
        </div>

        {/* Dynamic Filters Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="space-y-1.5 md:col-span-1">
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

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="All">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Creator Assigned</label>
            <select
              value={creatorFilter}
              onChange={(e) => setCreatorFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="All">All creators</option>
              {Array.from(new Set(tasks.map(t => t.issuedToWhom).filter(Boolean))).map(crt => (
                <option key={crt} value={crt}>{crt}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2 relative">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Created Date Range</label>
            <button
              type="button"
              id="date-filter-toggle-btn"
              onClick={() => {
                if (!isDateFilterOpen) {
                  setLocalStartDateStr(startDateStr);
                  setLocalEndDateStr(endDateStr);
                  let foundPreset = 'Custom';
                  if (!startDateStr && !endDateStr) {
                    foundPreset = 'Maximum';
                  } else {
                    for (const opt of PRESET_OPTIONS) {
                      const range = getPresetRange(opt);
                      if (range.startStr === startDateStr && range.endStr === endDateStr) {
                        foundPreset = opt;
                        break;
                      }
                    }
                  }
                  setActivePreset(foundPreset);
                  
                  // Sync calendars view to start date if present
                  if (startDateStr) {
                    const parts = startDateStr.split('-');
                    setViewYear(parseInt(parts[0], 10));
                    setViewMonth(parseInt(parts[1], 10) - 1);
                  } else {
                    const now = new Date();
                    setViewYear(now.getFullYear());
                    setViewMonth(now.getMonth());
                  }
                }
                setIsDateFilterOpen(!isDateFilterOpen);
              }}
              className="w-full h-9 px-3.5 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-bold text-slate-705 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent cursor-pointer transition-all hover:bg-slate-100/50"
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span>
                  {(() => {
                    if (!startDateStr && !endDateStr) return 'All Time (Maximum)';
                    
                    let activeOpt = 'Custom Range';
                    for (const opt of PRESET_OPTIONS) {
                      const range = getPresetRange(opt);
                      if (range.startStr === startDateStr && range.endStr === endDateStr) {
                        activeOpt = opt;
                        break;
                      }
                    }

                    if (activeOpt === 'Today' || activeOpt === 'Yesterday') {
                      return `${activeOpt}: ${formatHumanDate(startDateStr)}`;
                    }
                    if (activeOpt !== 'Custom Range') {
                      return `${activeOpt}`;
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
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isDateFilterOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDateFilterOpen && (
              <>
                {/* Underlay click capture to close */}
                <div 
                  id="date-filter-overlay-backdrop"
                  className="fixed inset-0 z-40 bg-transparent" 
                  onClick={() => setIsDateFilterOpen(false)}
                />
                
                {/* Expansive Date Filter Dropdown Panel */}
                <div 
                  id="date-filter-dropdown-panel"
                  className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 flex flex-col md:flex-row w-[670px] max-w-[95vw] overflow-hidden"
                >
                  {/* Left preset options panel */}
                  <div className="w-[180px] bg-slate-50 border-r border-slate-200 flex flex-col max-h-[380px] overflow-y-auto p-2 shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5 mb-1">Recently used</span>
                    <div className="space-y-0.5">
                      {PRESET_OPTIONS.map((opt) => {
                        const isSelected = activePreset === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handlePresetSelect(opt)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                              isSelected 
                                ? 'bg-blue-50 text-blue-700' 
                                : 'text-slate-605 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <span className="truncate">{opt}</span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0 ml-1.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Calendars & Bottom controls panel */}
                  <div className="flex-1 p-4 flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1 px-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      
                      <div className="text-xs text-slate-400 font-bold tracking-wider uppercase">Select Date Range</div>
                      
                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1 px-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Dual calendar months side-by-side */}
                    <div className="flex flex-col sm:flex-row gap-6">
                      {renderCalendarMonth(viewYear, viewMonth)}
                      {renderCalendarMonth(
                        viewMonth === 11 ? viewYear + 1 : viewYear,
                        (viewMonth + 1) % 12
                      )}
                    </div>

                    {/* Footer bounds inputs & update buttons */}
                    <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="px-2.5 py-1.5 border border-slate-200 bg-slate-50 rounded-lg font-mono font-bold text-slate-700 min-w-[100px] text-center" title="Start Date">
                          {localStartDateStr ? formatHumanDate(localStartDateStr) : 'Any Start'}
                        </div>
                        <span className="text-slate-405 font-bold">-</span>
                        <div className="px-2.5 py-1.5 border border-slate-200 bg-slate-50 rounded-lg font-mono font-bold text-slate-700 min-w-[100px] text-center" title="End Date">
                          {localEndDateStr ? formatHumanDate(localEndDateStr) : (localStartDateStr ? 'Any End' : 'Any End')}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end">
                        <button
                          type="button"
                          onClick={() => setIsDateFilterOpen(false)}
                          className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-606 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStartDateStr(localStartDateStr);
                            setEndDateStr(localEndDateStr);
                            setIsDateFilterOpen(false);
                          }}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                        >
                          Update
                        </button>
                      </div>
                    </div>

                    <div className="text-[9px] text-slate-400 font-medium text-center sm:text-left">
                      Dates are shown relative to Kolkata/Local Standard Time
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* MAIN TAB SWITCHBOARDS */}

        {/* TAB 1: TASKS REGISTRY GRID */}
        {activeTab === 'tasks' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
              <div>
                <h2 className="font-bold text-xs text-slate-400 uppercase tracking-wider flex items-center gap-1.5 hover:text-slate-600 transition-colors">
                  <Clock className="h-4 w-4" /> 
                  Real-time Task Ledger ({filteredTasks.length} {filteredTasks.length === 1 ? 'Pipeline' : 'Pipelines'})
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 cursor-pointer transition-colors"
                >
                  <Download className="h-3 w-3" />
                  CSV Export
                </button>
                <button
                  onClick={() => {
                    setIsImportModalOpen(true);
                    setImportFile(null);
                    setImportStatus('idle');
                    setImportLog('');
                    setParsedTasks([]);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer transition-all"
                  title="Import tasks from CSV/JSON or download complete backups"
                >
                  <Database className="h-3 w-3" />
                  Import & Backup
                </button>
                <button
                  onClick={() => alert(`Showing Table View of all ${filteredTasks.length} active pipelines.`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg cursor-pointer transition-all"
                >
                  Grid View
                </button>
                <button
                  onClick={() => {
                    setEditingTask(null);
                    setSelectedTaskFiles([]);
                    setTaskForm({
                      id: '', clientName: '', clientPhone: '', category: '', videoName: '',
                      scriptReady: 'No', price: 0, advance: 0, advReceivedDate: '', balance: 0,
                      balanceReceived: 'No', balRecDate: '', issuedToWhom: '', orderStatus: 'Pending',
                      paidToCreator: 'No', payableAmountToCreator: 0, paidToCreatorDate: '', script: '', deliveryDate: '',
                      orderDate: getTodayDDMMYYYY()
                    });
                    setIsTaskModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-950 text-white hover:bg-gray-900 px-3.5 py-1.5 rounded-lg cursor-pointer transition-all border border-gray-950"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Task
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
                <Loader2 className="animate-spin h-7 w-7 text-gray-600" />
                <span className="text-xs font-mono">Syncing database layers...</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="py-24 text-center text-gray-400 font-mono text-xs">
                No matching tasks found under specified filters.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" id="tasks-table">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-3 cursor-pointer select-none hover:bg-slate-100/50 hover:text-slate-800 transition-colors" onClick={() => handleSort('id')}>
                        <div className="flex items-center gap-1">
                          Task ID
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-3 px-3 cursor-pointer select-none hover:bg-slate-100/50 hover:text-slate-800 transition-colors" onClick={() => handleSort('clientName')}>
                        <div className="flex items-center gap-1">
                          Client Name
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3 cursor-pointer select-none hover:bg-slate-100/50 hover:text-slate-800 transition-colors" onClick={() => handleSort('videoName')}>
                        <div className="flex items-center gap-1">
                          Video Topic
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-3 px-3 text-center cursor-pointer select-none hover:bg-slate-100/50 hover:text-slate-800 transition-colors" onClick={() => handleSort('scriptReady')}>
                        <div className="flex items-center justify-center gap-1">
                          Script
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-3 px-3 text-indigo-600 cursor-pointer select-none hover:bg-indigo-50/40 transition-colors" onClick={() => handleSort('price')}>
                        <div className="flex items-center gap-1">
                          Rate
                          <ArrowUpDown className="h-3 w-3 text-indigo-400" />
                        </div>
                      </th>
                      <th className="py-3 px-3 text-indigo-600">Advance</th>
                      <th className="py-3 px-3">Balance</th>
                      <th className="py-3 px-3 text-center cursor-pointer select-none hover:bg-slate-100/50 hover:text-slate-800 transition-colors" onClick={() => handleSort('balanceReceived')}>
                        <div className="flex items-center justify-center gap-1">
                          Cleared?
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-3 px-4 cursor-pointer select-none hover:bg-slate-100/50 hover:text-slate-800 transition-colors" onClick={() => handleSort('issuedToWhom')}>
                        <div className="flex items-center gap-1">
                          Assignee
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-3 px-3 text-center cursor-pointer select-none hover:bg-slate-100/50 hover:text-slate-800 transition-colors" onClick={() => handleSort('orderStatus')}>
                        <div className="flex items-center justify-center gap-1">
                          Status
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-3 px-3 text-rose-600 font-extrabold uppercase">Creator Pay</th>
                      <th className="py-3 px-3 text-center cursor-pointer select-none hover:bg-slate-100/50 hover:text-slate-800 transition-colors" onClick={() => handleSort('paidToCreator')}>
                        <div className="flex items-center justify-center gap-1">
                          Paid?
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {paginatedTasks.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50/40 transition-colors">
                        {/* Task ID */}
                        <td className="py-3.5 px-3">
                          <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50/80 border border-blue-100 px-2 py-0.5 rounded block max-w-fit">
                            {task.id}
                          </span>
                          {task.orderDate && (
                            <span className="text-[9px] text-slate-400 font-semibold mt-1 font-mono tracking-wider block" title="Date Created">
                              {task.orderDate}
                            </span>
                          )}
                        </td>

                        {/* Client Name */}
                        <td className="py-3.5 px-3">
                          <span className="font-extrabold text-slate-900 block tracking-tight">{task.clientName}</span>
                          {task.clientPhone && (
                            <span className="text-[9px] text-slate-400 font-mono block mt-0.5">{task.clientPhone}</span>
                          )}
                        </td>

                        {/* Category */}
                        <td className="py-3.5 px-3">
                          <span className="inline-block text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider text-center">
                            {task.category || 'N/A'}
                          </span>
                        </td>

                        {/* Video Topic */}
                        <td className="py-3.5 px-3 max-w-[200px]">
                          <span className="block font-medium text-slate-700 truncate" title={task.videoName}>
                            {task.videoName}
                          </span>
                        </td>

                        {/* Script Badge Toggle */}
                        <td className="py-3.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => updateTaskInline(task.id, { scriptReady: task.scriptReady === 'Yes' ? 'No' : 'Yes' })}
                            className={`px-2.5 py-0.5 text-[9px] font-extrabold rounded-md shadow-2xs border transition-all cursor-pointer ${
                              task.scriptReady === 'Yes'
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {task.scriptReady === 'Yes' ? 'Yes' : 'No'}
                          </button>
                        </td>

                        {/* Rate */}
                        <td className="py-3.5 px-3">
                          <span className="font-bold text-indigo-600 font-mono text-xs">₹{task.price}</span>
                        </td>

                        {/* Advance */}
                        <td className="py-3.5 px-3">
                          <span className="font-semibold text-slate-800 font-mono text-xs">₹{task.advance}</span>
                        </td>

                        {/* Balance */}
                        <td className="py-3.5 px-3">
                          <span
                            className={`font-mono font-bold text-xs ${
                              task.balanceReceived === 'Yes'
                                ? 'line-through text-slate-400 font-medium'
                                : 'text-amber-600'
                            }`}
                          >
                            ₹{task.balance}
                          </span>
                        </td>

                        {/* Cleared Status Button */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="flex flex-col items-center justify-center">
                            {task.balanceReceived === 'Yes' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setConfirmAction({ type: 'cleared', taskId: task.id, nextValue: 'No' })}
                                  className="px-2.5 py-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all flex items-center gap-1 cursor-pointer max-w-fit shadow-3xs"
                                >
                                  <Check className="h-2.5 w-2.5 stroke-[3]" /> Cleared
                                </button>
                                {task.balRecDate && (
                                  editingDateCell?.taskId === task.id && editingDateCell?.type === 'balRecDate' ? (
                                    <input
                                      type="text"
                                      value={inlineDateValue}
                                      placeholder="DD/MM/YYYY"
                                      onChange={(e) => setInlineDateValue(e.target.value)}
                                      onKeyDown={async (ev) => {
                                        if (ev.key === 'Enter') {
                                          await updateTaskInline(task.id, { balRecDate: inlineDateValue });
                                          setEditingDateCell(null);
                                        } else if (ev.key === 'Escape') {
                                          setEditingDateCell(null);
                                        }
                                      }}
                                      onBlur={async () => {
                                        await updateTaskInline(task.id, { balRecDate: inlineDateValue });
                                        setEditingDateCell(null);
                                      }}
                                      className="text-[9px] w-20 px-1 py-0.5 border border-slate-300 rounded font-mono text-center outline-none bg-white font-semibold mt-1"
                                      autoFocus
                                    />
                                  ) : (
                                    <span
                                      onClick={() => {
                                        setEditingDateCell({ taskId: task.id, type: 'balRecDate' });
                                        setInlineDateValue(task.balRecDate || '');
                                      }}
                                      className="text-[9px] text-slate-400 font-semibold mt-1 font-mono tracking-wider cursor-pointer hover:text-slate-600 hover:underline block"
                                      title="Click to edit date"
                                    >
                                      {task.balRecDate}
                                    </span>
                                  )
                                )}
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ type: 'cleared', taskId: task.id, nextValue: 'Yes' })}
                                className="px-2.5 py-1 text-[9px] font-bold text-slate-600 bg-amber-50 border border-amber-200 rounded-lg hover:border-amber-300 hover:bg-amber-100/50 transition-all cursor-pointer max-w-fit shadow-3xs"
                              >
                                  Unpaid
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Assignee (Read-only) */}
                         <td className="py-3.5 px-4">
                           <span className={`inline-block px-2.5 py-1.5 text-[10px] font-extrabold rounded-lg border uppercase tracking-wider ${
                             task.issuedToWhom 
                                ? 'text-slate-700 bg-slate-50 border-slate-200' 
                                : 'text-slate-400 bg-gray-50/50 border-dashed border-slate-200'
                           }`}>
                             {task.issuedToWhom || 'Unassigned'}
                           </span>
                         </td>
                         {/* Status Direct Select */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <div className="relative inline-block">
                              <select
                                value={task.orderStatus}
                                onChange={async (e) => {
                                  const val = e.target.value as any;
                                  const updates: any = { orderStatus: val };
                                  if (val === 'Completed') {
                                    updates.deliveryDate = getTodaysDateStr();
                                  } else {
                                    updates.deliveryDate = '';
                                  }
                                  await updateTaskInline(task.id, updates);
                                }}
                                className={`appearance-none pl-2.5 pr-7 py-1.5 border rounded-lg text-[9px] font-extrabold outline-none cursor-pointer tracking-wider transition-all shadow-3xs ${
                                  task.orderStatus === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' :
                                  task.orderStatus === 'In Progress' ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' :
                                  'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                }`}
                              >
                                <option value="Pending">PENDING</option>
                                <option value="In Progress">IN PROGRESS</option>
                                <option value="Completed">COMPLETED</option>
                              </select>
                              <ChevronDown className={`h-3 w-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                                task.orderStatus === 'Completed' ? 'text-emerald-500' :
                                task.orderStatus === 'In Progress' ? 'text-blue-500' :
                                'text-amber-500'
                              }`} />
                            </div>
                            {task.orderStatus === 'Completed' && task.deliveryDate && (
                              editingDateCell?.taskId === task.id && editingDateCell?.type === 'deliveryDate' ? (
                                <input
                                  type="text"
                                  value={inlineDateValue}
                                  placeholder="DD/MM/YYYY"
                                  onChange={(e) => setInlineDateValue(e.target.value)}
                                  onKeyDown={async (ev) => {
                                    if (ev.key === 'Enter') {
                                      await updateTaskInline(task.id, { deliveryDate: inlineDateValue });
                                      setEditingDateCell(null);
                                    } else if (ev.key === 'Escape') {
                                      setEditingDateCell(null);
                                    }
                                  }}
                                  onBlur={async () => {
                                    await updateTaskInline(task.id, { deliveryDate: inlineDateValue });
                                    setEditingDateCell(null);
                                  }}
                                  className="text-[9px] w-20 px-1 py-0.5 border border-slate-300 rounded font-mono text-center outline-none bg-white font-semibold mt-1"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingDateCell({ taskId: task.id, type: 'deliveryDate' });
                                    setInlineDateValue(task.deliveryDate || '');
                                  }}
                                  className="text-[9px] text-slate-400 font-semibold mt-1 font-mono tracking-wider cursor-pointer hover:text-slate-600 hover:underline block"
                                  title="Click to edit date"
                                >
                                  {task.deliveryDate}
                                </span>
                              )
                            )}
                          </div>
                        </td>

                        {/* Creator Pay */}
                        <td className="py-3.5 px-3">
                          <span className="font-bold text-slate-800 font-mono text-xs">₹{task.payableAmountToCreator || 0}</span>
                        </td>

                        {/* Creator Paid? (Settled button toggle) */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="flex flex-col items-center justify-center">
                            {task.paidToCreator === 'Yes' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setConfirmAction({ type: 'paid', taskId: task.id, nextValue: 'No' })}
                                  className="px-2.5 py-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all flex items-center justify-center gap-1 cursor-pointer max-w-fit shadow-2xs"
                                >
                                  <Check className="h-2 w-2 stroke-[3]" /> Settled
                                </button>
                                {task.paidToCreatorDate && (
                                  editingDateCell?.taskId === task.id && editingDateCell?.type === 'paidToCreatorDate' ? (
                                    <input
                                      type="text"
                                      value={inlineDateValue}
                                      placeholder="DD/MM/YYYY"
                                      onChange={(e) => setInlineDateValue(e.target.value)}
                                      onKeyDown={async (ev) => {
                                        if (ev.key === 'Enter') {
                                          await updateTaskInline(task.id, { paidToCreatorDate: inlineDateValue });
                                          setEditingDateCell(null);
                                        } else if (ev.key === 'Escape') {
                                          setEditingDateCell(null);
                                        }
                                      }}
                                      onBlur={async () => {
                                        await updateTaskInline(task.id, { paidToCreatorDate: inlineDateValue });
                                        setEditingDateCell(null);
                                      }}
                                      className="text-[9px] w-20 px-1 py-0.5 border border-slate-300 rounded font-mono text-center outline-none bg-white font-semibold mt-1"
                                      autoFocus
                                    />
                                  ) : (
                                    <span
                                      onClick={() => {
                                        setEditingDateCell({ taskId: task.id, type: 'paidToCreatorDate' });
                                        setInlineDateValue(task.paidToCreatorDate || '');
                                      }}
                                      className="text-[9px] text-slate-400 font-semibold mt-1 font-mono tracking-wider cursor-pointer hover:text-slate-600 hover:underline block"
                                      title="Click to edit date"
                                    >
                                      {task.paidToCreatorDate}
                                    </span>
                                  )
                                )}
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ type: 'paid', taskId: task.id, nextValue: 'Yes' })}
                                className="px-2.5 py-1 text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-100/50 rounded-lg hover:bg-rose-100 hover:border-rose-300 transition-all cursor-pointer max-w-fit shadow-2xs"
                              >
                                Unpaid
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingTask(task)}
                              className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer transition-all"
                              title="View full task details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditClick(task)}
                              className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer transition-all"
                              title="Edit full task details"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <div className="relative inline-block">
                              <button
                                type="button"
                                onClick={() => triggerWhatsApp(task.clientPhone, task)}
                                className={`p-1 hover:bg-emerald-50 rounded-md cursor-pointer transition-all ${
                                  shouldShowWhatsAppIndicator(task)
                                    ? 'text-emerald-600 bg-emerald-50'
                                    : 'text-slate-400 hover:text-emerald-600'
                                }`}
                                title="Send WhatsApp to Client"
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </button>
                              {shouldShowWhatsAppIndicator(task) && (
                                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2 pointer-events-none">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => triggerWhatsAppToCreator(task)}
                              className="p-1 hover:bg-blue-50 rounded-md text-slate-400 hover:text-blue-600 cursor-pointer transition-all"
                              title="Send Task details to Creator via WhatsApp"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setTaskToDelete(task)}
                              className="p-1 hover:bg-red-50 rounded-md text-slate-400 hover:text-red-500 cursor-pointer transition-all"
                              title="Delete task pipeline"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isPaginationActive && (
                <div className="px-4 py-3.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/30">
                  {/* Left Side: Page Info / Rows Per Page Selector */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium">
                    <div className="flex items-center gap-2">
                      <span>Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer shadow-3xs"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={30}>30</option>
                      </select>
                    </div>
                    <span className="text-[11px] font-mono font-medium text-slate-450">
                      Showing <span className="font-semibold text-slate-700">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-semibold text-slate-700">{Math.min(currentPage * pageSize, totalTasks)}</span> of <span className="font-semibold text-slate-700">{totalTasks}</span> tasks
                    </span>
                  </div>

                  {/* Right Side: Navigation Page Numbers + Previous/Next Buttons */}
                  <div className="flex items-center gap-1.5 self-center sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className={`p-1.5 rounded-lg border border-slate-200 flex items-center justify-center cursor-pointer transition-all ${
                        currentPage === 1
                          ? 'text-slate-300 bg-slate-50/50 cursor-not-allowed border-slate-150'
                          : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-800'
                      }`}
                      title="Previous Page"
                    >
                      <ChevronLeft className="h-4 w-4 stroke-[2.25]" />
                    </button>

                    {/* Page Numbers */}
                    <div className="flex items-center gap-1">
                      {getPageNumbers().map((pageNum, idx) => {
                        if (pageNum === '...') {
                          return (
                            <span key={`dots-${idx}`} className="px-2 text-slate-450 font-bold select-none text-[11px] font-mono">
                              ...
                            </span>
                          );
                        }
                        const isActive = pageNum === currentPage;
                        return (
                          <button
                            key={`page-${pageNum}`}
                            type="button"
                            onClick={() => setCurrentPage(pageNum as number)}
                            className={`min-w-[28px] h-7 px-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                              isActive
                                ? 'bg-slate-900 border-slate-950 text-white shadow-3xs hover:bg-black font-extrabold'
                                : 'bg-white border-slate-250 text-slate-650 hover:bg-slate-50 hover:text-slate-800'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className={`p-1.5 rounded-lg border border-slate-200 flex items-center justify-center cursor-pointer transition-all ${
                        currentPage === totalPages
                          ? 'text-slate-300 bg-slate-50/50 cursor-not-allowed border-slate-150'
                          : 'text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-800'
                      }`}
                      title="Next Page"
                    >
                      <ChevronRight className="h-4 w-4 stroke-[2.25]" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          </div>
        )}

        {/* TAB 2: FINANCIAL STATS & EXPENSES */}
        {activeTab === 'finance' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="admin-finance-grid">
            {/* Margins breakdown analysis */}
            <div className="lg:col-span-8 bg-white border border-gray-100 rounded-xl shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Projected Revenue Output & Margin Structure</h2>
                <p className="text-xs text-gray-400 mt-1">Calculates project collections vs. software & personnel expenditures.</p>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Margins Calculation Summary</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100 font-mono">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Gross Revenue</span>
                      <p className="text-sm font-extrabold text-gray-900">₹{grossBillings}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Work Payouts (Creator)</span>
                      <p className="text-sm font-extrabold text-red-600">- ₹{filteredTasks.reduce((sum, t) => sum + t.payableAmountToCreator, 0)}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Other Expenses</span>
                      <p className="text-sm font-extrabold text-red-600">- ₹{totalOtherExpenses}</p>
                    </div>
                    <div className="space-y-1 bg-green-50/70 p-1.5 rounded border border-green-100/50">
                      <span className="text-[10px] font-bold text-green-700 uppercase">Projected Net profit</span>
                      <p className="text-base font-black text-green-700">₹{projectedMargin}</p>
                    </div>
                  </div>
                </div>

                {/* Expenses register view */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Other Corporate Operating Expenses</h3>
                    <button
                      onClick={() => {
                        if (addingExpense) {
                          setAddingExpense(false);
                          setEditingExpenseId(null);
                          setExpenseForm({ description: '', amount: 0, date: '' });
                        } else {
                          setAddingExpense(true);
                        }
                      }}
                      className="text-xs font-semibold bg-gray-900 text-white px-2.5 py-1.5 rounded hover:bg-gray-800 cursor-pointer inline-flex items-center gap-1"
                    >
                      {editingExpenseId ? (
                        <>Cancel Editing</>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          Add Expense
                        </>
                      )}
                    </button>
                  </div>

                  {addingExpense && (
                    <form onSubmit={handleAddExpense} className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-3">
                      <div className="flex justify-between items-center pb-1 border-b border-gray-100/60">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {editingExpenseId ? 'Edit Corporate Expense' : 'Record Operating Expense'}
                        </span>
                        {editingExpenseId && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 font-bold border border-blue-200 rounded uppercase tracking-wider font-mono">
                            ID: {editingExpenseId}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Description</label>
                          <input
                            type="text"
                            required
                            value={expenseForm.description}
                            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                            placeholder="e.g. Electricity, stock audio key"
                            className="w-full px-3 py-1.5 border border-gray-200 bg-white rounded text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Amount (₹)</label>
                          <input
                            type="number"
                            required
                            value={expenseForm.amount || ''}
                            onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                            placeholder="Amount in Rupees"
                            className="w-full px-3 py-1.5 border border-gray-200 bg-white rounded text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Date</label>
                          <input
                            type="text"
                            value={expenseForm.date}
                            onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                            placeholder="DD/MM/YYYY"
                            className="w-full px-3 py-1.5 border border-gray-200 bg-white rounded text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setAddingExpense(false);
                            setEditingExpenseId(null);
                            setExpenseForm({ description: '', amount: 0, date: '' });
                          }}
                          className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded font-medium cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1.5 bg-gray-950 text-white hover:bg-gray-900 rounded font-medium cursor-pointer"
                        >
                          {editingExpenseId ? 'Update Expense' : 'Save Expense'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Category/Description</th>
                          <th className="py-2.5 px-3 font-mono text-right">Amount (₹)</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-xs">
                        {filteredExpenses.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-gray-400 font-mono">No other operational expenses recorded in this period.</td>
                          </tr>
                        ) : (
                          filteredExpenses.map((exp) => (
                            <tr key={exp.id} className="hover:bg-gray-50/50">
                              <td className="py-2.5 px-3 text-gray-500">{exp.date}</td>
                              <td className="py-2.5 px-3 font-medium text-gray-800">{exp.description}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600">-₹{exp.amount}</td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="flex justify-end gap-1.5 items-center">
                                  <button
                                    onClick={() => {
                                      setExpenseForm({
                                        description: exp.description,
                                        amount: exp.amount,
                                        date: exp.date || ''
                                      });
                                      setEditingExpenseId(exp.id);
                                      setAddingExpense(true);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 p-1 cursor-pointer rounded hover:bg-blue-50 transition-all"
                                    title="Edit Expense"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteExpense(exp.id)}
                                    className="text-red-550 hover:text-red-750 p-1 cursor-pointer rounded hover:bg-red-50 transition-all"
                                    title="Delete Expense"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Summary Side Info */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-xs whitespace-pre-line space-y-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Operational Ratios</span>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-gray-500">Total Projects:</span>
                    <span className="font-bold text-gray-900">{tasks.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-gray-500">Completed Projects:</span>
                    <span className="font-bold text-green-700">{tasks.filter(t => t.orderStatus === 'Completed').length} ({Math.round((tasks.filter(t => t.orderStatus === 'Completed').length / tasks.length) * 100)}%)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-gray-500">Script Ready:</span>
                    <span className="font-bold text-indigo-700">{tasks.filter(t => t.scriptReady === 'Yes').length} ({Math.round((tasks.filter(t => t.scriptReady === 'Yes').length / tasks.length) * 100)}%)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono pt-4 border-t border-gray-100">
                    <span className="text-gray-500">Net Profit Margin ratio:</span>
                    <span className="font-bold text-gray-950">{Math.round((projectedMargin / grossBillings) * 100)}% of billings</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CLIENT AGING OVERDUE TRACKING */}
        {activeTab === 'overdue' && (
          <div className="space-y-6">
            {/* FIRST BOX: CLIENT ACCOUNTS AGING OVERDUE ANALYTICS */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Client Accounts Aging Overdue Analytics</h2>
                <p className="text-xs text-gray-400 mt-1">Tracks clients with outstanding bills, classified by days elapsed since task completion (Anchor date: 28/05/2026).</p>
              </div>

              <div className="p-6 space-y-6">
                {overdueClientsList.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 font-mono text-xs">
                    All Client Accounts are fully settled! No overdue balances today.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Ledger reports list */}
                    <div className="overflow-x-auto border border-gray-100 rounded-lg">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            <th className="py-3 px-4">Client Representative</th>
                            <th className="py-3 px-4 text-center">Unresolved projects</th>
                            <th className="py-3 px-4 font-mono">Total Billed</th>
                            <th className="py-3 px-4 font-mono">Settled Paid</th>
                            <th className="py-3 px-4 font-mono text-red-600">Balance Overdue</th>
                            <th className="py-3 px-4 bg-orange-50 text-orange-850 text-center">0-2 Days</th>
                            <th className="py-3 px-4 bg-red-50 text-red-850 text-center">3-5 Days</th>
                            <th className="py-3 px-4 bg-purple-50 text-purple-850 text-center">6-10+ Days</th>
                            <th className="py-3 px-4 text-right">Drill down / Alert</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs">
                          {overdueClientsList.map((rep) => (
                            <tr key={rep.clientName} className="hover:bg-gray-50/50">
                              <td className="py-3 px-4 font-bold text-gray-900">
                                {rep.clientName}
                              </td>
                              <td className="py-3 px-4 text-center font-semibold text-gray-650">
                                {rep.overdueTasksCount}
                              </td>
                              <td className="py-3 px-4 font-mono font-medium">₹{rep.totalBilled.toLocaleString()}</td>
                              <td className="py-3 px-4 font-mono font-medium text-green-600">₹{rep.totalPaid.toLocaleString()}</td>
                              <td className="py-3 px-4 font-mono font-black text-red-600">₹{rep.overdueBal.toLocaleString()}</td>
                              <td className="py-3 px-4 font-mono bg-orange-50/20 text-center font-bold text-orange-700">₹{rep.aging0_2.toLocaleString()}</td>
                              <td className="py-3 px-4 font-mono bg-red-50/20 text-center font-bold text-red-750">₹{rep.aging3_5.toLocaleString()}</td>
                              <td className="py-3 px-4 font-mono bg-purple-50/20 text-center font-bold text-purple-750">₹{rep.aging6Plus.toLocaleString()}</td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const originalPhone = existingClientsMap[rep.clientName] || '';
                                      setEditingClientOriginalName(rep.clientName);
                                      setNewClientName(rep.clientName);
                                      setNewClientPhone(originalPhone);
                                      setIsClientEditModalOpen(true);
                                    }}
                                    className="text-[10px] font-bold px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200 cursor-pointer inline-flex items-center gap-0.5"
                                    title="Edit Client Name/Phone"
                                  >
                                    <Edit className="h-2.5 w-2.5" /> Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedLedgerClient(rep.clientName);
                                      setActiveTab('ledgers');
                                    }}
                                    className="text-[10px] font-bold px-2 py-1 bg-gray-100 text-gray-700 rounded border border-gray-200 cursor-pointer"
                                  >
                                    Ledger
                                  </button>
                                  <button
                                    onClick={() => {
                                      const associatedTask = tasks.find(t => t.clientName === rep.clientName);
                                      if (associatedTask) triggerWhatsApp(associatedTask.clientPhone, associatedTask);
                                    }}
                                    className="text-[10px] font-bold px-2 py-1 bg-green-50 text-green-800 rounded border border-green-200 cursor-pointer inline-flex items-center gap-0.5"
                                  >
                                    <Phone className="h-2.5 w-2.5" /> Alert
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECOND BOX: CREATOR PAYABLES AGING LIABILITY ANALYTICS */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Creator Payables Aging Liability Analytics</h2>
                <p className="text-xs text-gray-400 mt-1">Tracks team members / creators with outstanding payable balances, classified by days elapsed since task completion (Anchor date: 28/05/2026).</p>
              </div>

              <div className="p-6 space-y-6">
                {overdueCreatorsList.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 font-mono text-xs">
                    All Creator Liability payouts are fully settled! No outstanding liabilities today.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Creator table */}
                    <div className="overflow-x-auto border border-gray-100 rounded-lg">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            <th className="py-3 px-4">Creator / Team Member</th>
                            <th className="py-3 px-4 text-center">Unpaid Projects</th>
                            <th className="py-3 px-4 font-mono">Total Earned</th>
                            <th className="py-3 px-4 font-mono">Settled Paid</th>
                            <th className="py-3 px-4 font-mono text-orange-600">Outstanding Payable</th>
                            <th className="py-3 px-4 bg-orange-50 text-orange-850 text-center">0-2 Days</th>
                            <th className="py-3 px-4 bg-red-50 text-red-850 text-center">3-5 Days</th>
                            <th className="py-3 px-4 bg-purple-50 text-purple-850 text-center">6-10+ Days</th>
                            <th className="py-3 px-4 text-right">Drill down / Alert</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs">
                          {overdueCreatorsList.map((rep) => (
                            <tr key={rep.creatorName} className="hover:bg-gray-50/50">
                              <td className="py-3 px-4 font-bold text-gray-900">
                                {rep.creatorName}
                              </td>
                              <td className="py-3 px-4 text-center font-semibold text-gray-650">
                                {rep.overdueTasksCount}
                              </td>
                              <td className="py-3 px-4 font-mono font-medium">₹{rep.totalEarned.toLocaleString()}</td>
                              <td className="py-3 px-4 font-mono font-medium text-green-600">₹{rep.totalPaid.toLocaleString()}</td>
                              <td className="py-3 px-4 font-mono font-black text-orange-600">₹{rep.overdueBal.toLocaleString()}</td>
                              <td className="py-3 px-4 font-mono bg-orange-50/20 text-center font-bold text-orange-700">₹{rep.aging0_2.toLocaleString()}</td>
                              <td className="py-3 px-4 font-mono bg-red-50/20 text-center font-bold text-red-750">₹{rep.aging3_5.toLocaleString()}</td>
                              <td className="py-3 px-4 font-mono bg-purple-50/20 text-center font-bold text-purple-750">₹{rep.aging6Plus.toLocaleString()}</td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setSelectedLedgerCreator(rep.creatorName);
                                      setActiveTab('ledgers');
                                    }}
                                    className="text-[10px] font-bold px-2 py-1 bg-gray-100 text-gray-700 rounded border border-gray-200 cursor-pointer"
                                  >
                                    Ledger
                                  </button>
                                  <button
                                    onClick={() => {
                                      const phoneInput = window.prompt(`Enter WhatsApp number for "${rep.creatorName}" to send layout alert (default 919999999999):`, "");
                                      if (phoneInput === null) return;
                                      const cleanPhone = phoneInput.replace(/[^0-9]/g, '') || '919999999999';
                                      const message = `Hey ${rep.creatorName}, here is an update regarding your completed video project payouts with Templatesvilla. Your outstanding liability on ${rep.overdueTasksCount} task(s) currently totals ₹${rep.overdueBal.toLocaleString()}. Please review the ledger.`;
                                      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
                                    }}
                                    className="text-[10px] font-bold px-2 py-1 bg-green-50 text-green-800 rounded border border-green-200 cursor-pointer inline-flex items-center gap-0.5"
                                  >
                                    <Phone className="h-2.5 w-2.5" /> Alert
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CLIENT & CREATOR GENERAL LEDGERS */}
        {activeTab === 'ledgers' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" id="ledgers-desk-container">
            {/* CLIENT LEDGERS SEARCH & DISPLAY */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Client Invoicing & Payment Ledger</h2>
                <p className="text-xs text-gray-400 mt-1">Audit billing trails and outstanding values per company.</p>
              </div>

              <div className="p-5 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Select Client</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedLedgerClient}
                      onChange={(e) => setSelectedLedgerClient(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold"
                    >
                      <option value="">-- Choose a Client --</option>
                      {uniqueClientNames.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    {selectedLedgerClient && (
                      <button
                        type="button"
                        onClick={() => {
                          const originalPhone = existingClientsMap[selectedLedgerClient] || '';
                          setEditingClientOriginalName(selectedLedgerClient);
                          setNewClientName(selectedLedgerClient);
                          setNewClientPhone(originalPhone);
                          setIsClientEditModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="Edit client name or phone number"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit Client
                      </button>
                    )}
                  </div>
                </div>

                {selectedLedgerClient ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 grid grid-cols-3 gap-2 font-mono text-xs">
                      <div>
                        <span className="block text-[9px] text-gray-400 font-bold uppercase mb-0.5">Total Projects</span>
                        <span className="font-bold text-gray-850">{tasks.filter(t => t.clientName === selectedLedgerClient).length}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-gray-400 font-bold uppercase mb-0.5">Total Billed</span>
                        <span className="font-bold text-gray-850">₹{tasks.filter(t => t.clientName === selectedLedgerClient).reduce((sum, t) => sum + t.price, 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-gray-400 font-bold uppercase mb-0.5">Outstanding Overdue</span>
                        <span className="font-bold text-red-600">₹{tasks.filter(t => t.clientName === selectedLedgerClient && t.balanceReceived === 'No').reduce((sum, t) => sum + t.balance, 0).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="border border-gray-100 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-100 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Project Detail</th>
                            <th className="py-2.5 px-3 text-right">Debit Charged</th>
                            <th className="py-2.5 px-3 text-right">Credit Paid</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-mono">
                          {tasks
                            .filter(t => t.clientName === selectedLedgerClient)
                            .sort((a, b) => {
                              const dateA = parseDDMMYYYY(a.orderDate);
                              const dateB = parseDDMMYYYY(b.orderDate);
                              const timeA = dateA ? dateA.getTime() : 0;
                              const timeB = dateB ? dateB.getTime() : 0;
                              return timeB - timeA;
                            })
                            .map((task) => (
                            <React.Fragment key={task.id}>
                              <tr className="hover:bg-gray-50/50">
                                <td className="py-2.5 px-3">{task.orderDate}</td>
                                <td className="py-2.5 px-3 font-sans truncate max-w-[150px]">{task.videoName} (Billed)</td>
                                <td className="py-2.5 px-3 text-right font-semibold">₹{task.price}</td>
                                <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                              </tr>
                              {task.advance > 0 && (
                                <tr className="bg-green-50/20 text-green-700">
                                  <td className="py-2.5 px-3 text-gray-500 font-sans">{task.advReceivedDate || task.orderDate}</td>
                                  <td className="py-2.5 px-3 font-sans truncate pl-6">↳ Advance Received</td>
                                  <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                                  <td className="py-2.5 px-3 text-right font-medium">-₹{task.advance}</td>
                                </tr>
                              )}
                              {task.balanceReceived === 'Yes' && (
                                <tr className="bg-green-100/35 text-green-800">
                                  <td className="py-2.5 px-3 text-gray-500 font-sans">{task.balRecDate || task.orderDate}</td>
                                  <td className="py-2.5 px-3 font-sans truncate pl-6">↳ Balance Settled</td>
                                  <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                                  <td className="py-2.5 px-3 text-right font-extrabold">-₹{task.balance}</td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-400 font-mono text-xs">Select a client above to view transactional statements.</div>
                )}
              </div>
            </div>

            {/* CREATOR PAYOUT LEDGERS */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Creator Compensation & Payables Ledger</h2>
                <p className="text-xs text-gray-400 mt-1">Audit payouts, pending creator releases, and work completed per teammate.</p>
              </div>

              <div className="p-5 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Select Creator</label>
                  <select
                    value={selectedLedgerCreator}
                    onChange={(e) => setSelectedLedgerCreator(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold"
                  >
                    <option value="">-- Choose a Creator --</option>
                    {Array.from(new Set(tasks.map(t => t.issuedToWhom).filter(Boolean))).map(crt => (
                      <option key={crt} value={crt}>{crt}</option>
                    ))}
                  </select>
                </div>

                {selectedLedgerCreator ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 grid grid-cols-3 gap-2 font-mono text-xs">
                      <div>
                        <span className="block text-[9px] text-gray-400 font-bold uppercase mb-0.5">Tasks Assigned</span>
                        <span className="font-bold text-gray-855">{tasks.filter(t => t.issuedToWhom === selectedLedgerCreator).length}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-gray-400 font-bold uppercase mb-0.5">Earned & Released</span>
                        <span className="font-bold text-green-700">₹{tasks.filter(t => t.issuedToWhom === selectedLedgerCreator && t.paidToCreator === 'Yes').reduce((sum, t) => sum + t.payableAmountToCreator, 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-gray-400 font-bold uppercase mb-0.5">Pending Released</span>
                        <span className="font-bold text-amber-700">₹{tasks.filter(t => t.issuedToWhom === selectedLedgerCreator && t.paidToCreator === 'No').reduce((sum, t) => sum + t.payableAmountToCreator, 0).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="border border-gray-100 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-100 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Project</th>
                            <th className="py-2.5 px-3 text-right">Compensation (Debit)</th>
                            <th className="py-2.5 px-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-mono">
                          {tasks
                            .filter(t => t.issuedToWhom === selectedLedgerCreator)
                            .sort((a, b) => {
                              const dateA = parseDDMMYYYY(a.orderDate);
                              const dateB = parseDDMMYYYY(b.orderDate);
                              const timeA = dateA ? dateA.getTime() : 0;
                              const timeB = dateB ? dateB.getTime() : 0;
                              return timeB - timeA;
                            })
                            .map((task) => (
                            <tr key={task.id} className="hover:bg-gray-50/50">
                              <td className="py-2.5 px-3">{task.orderDate}</td>
                              <td className="py-2.5 px-3 font-sans truncate max-w-[150px]">{task.videoName}</td>
                              <td className="py-2.5 px-3 text-right font-semibold">₹{task.payableAmountToCreator}</td>
                              <td className="py-2.5 px-3 text-right">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  task.paidToCreator === 'Yes' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {task.paidToCreator === 'Yes' ? 'Released' : 'Pending'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-400 font-mono text-xs">Select a creator above to inspect compensation cards.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: MANAGING TEAM MEMBER CREDENTIALS */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="admin-user-payouts-container">
            {/* Account List */}
            <div className="lg:col-span-6 bg-white border border-gray-100 rounded-xl shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <div>
                  <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Team Passwords Directory</h2>
                  <p className="text-xs text-gray-400 mt-1">Direct oversight of accounts, keys, and authorization roles.</p>
                </div>
                <button
                  onClick={() => setIsAddingUser(!isAddingUser)}
                  className="text-xs font-semibold bg-gray-950 text-white hover:bg-gray-900 px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  Create User
                </button>
              </div>

              <div className="p-5 space-y-6">
                {isAddingUser && (
                  <form onSubmit={handleCreateUser} className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-3.5">
                    <h3 className="text-xs font-bold text-gray-700 uppercase">Create Teammate Login</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">User ID</label>
                        <input
                          type="text"
                          required
                          value={newUserForm.userId}
                          onChange={(e) => setNewUserForm({ ...newUserForm, userId: e.target.value })}
                          placeholder="e.g. Bhutesh"
                          className="w-full px-3 py-2 border border-gray-200 bg-white rounded outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Initial Password</label>
                        <input
                          type="text"
                          required
                          value={newUserForm.password}
                          onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                          placeholder="e.g. creator123"
                          className="w-full px-3 py-2 border border-gray-200 bg-white rounded outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Teammate Display Name</label>
                        <input
                          type="text"
                          value={newUserForm.name}
                          onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                          placeholder="Display Name of Creator"
                          className="w-full px-3 py-2 border border-gray-200 bg-white rounded outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">System Role</label>
                        <select
                          value={newUserForm.role}
                          onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 bg-white rounded outline-none"
                        >
                          <option value="Member">Team Creator (Member)</option>
                          <option value="Admin">Administrator (Admin)</option>
                        </select>
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Teammate Phone Number</label>
                        <input
                          type="text"
                          value={newUserForm.phone}
                          onChange={(e) => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                          placeholder="e.g. +91 9988776655"
                          className="w-full px-3 py-2 border border-gray-200 bg-white rounded outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 text-xs pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingUser(false)}
                        className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-gray-950 text-white hover:bg-gray-900 rounded font-medium cursor-pointer"
                      >
                        Save Account
                      </button>
                    </div>
                  </form>
                )}

                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        <th className="py-2.5 px-3">Full Name</th>
                        <th className="py-2.5 px-3">User ID / Phone</th>
                        <th className="py-2.5 px-3">Password Reference</th>
                        <th className="py-2.5 px-3">Role Status</th>
                        <th className="py-2.5 px-3 text-right">Settings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map((item) => (
                        <tr key={item.userId} className="hover:bg-gray-50/50">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-gray-800">{item.name}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] space-y-0.5">
                            <div className="font-bold text-gray-650">{item.userId}</div>
                            {item.phone && (
                              <div className="text-gray-450 text-[10px] select-all cursor-pointer hover:text-gray-700 font-sans font-medium">{item.phone}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-gray-400">{item.passwordHash}</td>
                          <td className="py-2.5 px-3">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              item.role === 'Admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {item.role}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setPasswordChangeForm({
                                    targetUserId: item.userId,
                                    newPassword: item.passwordHash,
                                    newName: item.name,
                                    newPhone: item.phone || ''
                                  });
                                }}
                                className="text-[10px] font-semibold hover:bg-gray-100 hover:text-gray-900 border border-gray-200 px-1.5 py-0.5 rounded cursor-pointer transition-all"
                              >
                                Modify
                              </button>
                              {item.userId !== 'TemplatesvillaRDA' && (
                                <button
                                  onClick={() => handleDeleteUser(item.userId)}
                                  className="text-red-500 hover:text-red-700 p-0.5 align-middle cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Adjust/Edit Credentials Desk */}
            <div className="lg:col-span-6 bg-white border border-gray-100 rounded-xl shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Credential settings modifications</h2>
                <p className="text-xs text-gray-400 mt-1">Select any user on the left first to modify password details.</p>
              </div>

              <div className="p-5">
                {passwordChangeForm.targetUserId ? (
                  <form onSubmit={handleUpdateUserCredentials} className="space-y-4 text-xs">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Selected Account Target</span>
                      <span className="text-sm font-bold text-gray-900 bg-gray-50 px-3 py-1.5 block rounded outline-none border border-gray-100">{passwordChangeForm.targetUserId}</span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase block">Display Name</label>
                      <input
                        type="text"
                        value={passwordChangeForm.newName}
                        onChange={(e) => setPasswordChangeForm({ ...passwordChangeForm, newName: e.target.value })}
                        placeholder="Modified Display Name"
                        className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase block">Phone Number</label>
                      <input
                        type="text"
                        value={passwordChangeForm.newPhone}
                        onChange={(e) => setPasswordChangeForm({ ...passwordChangeForm, newPhone: e.target.value })}
                        placeholder="Modified Phone Number"
                        className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase block">Reset Password</label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={passwordChangeForm.newPassword}
                          onChange={(e) => setPasswordChangeForm({ ...passwordChangeForm, newPassword: e.target.value })}
                          placeholder="Adjust Password"
                          className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setPasswordChangeForm({ targetUserId: '', newPassword: '', newName: '', newPhone: '' })}
                        className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded font-medium cursor-pointer"
                      >
                        Reset Select
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-gray-950 text-white hover:bg-gray-900 rounded font-semibold cursor-pointer"
                      >
                        Commit Changes
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="py-16 text-center text-gray-400 font-mono text-xs">
                    Please click “Modify” next to any user account on the left to handle updates.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* CORE DETAIL DRAWER/MODAL FOR VIEWING TASK DETAILS */}
      {viewingTask && (
        <div className="fixed inset-0 bg-gray-950/45 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block font-mono">{viewingTask.id} • {viewingTask.category}</span>
                <h3 className="font-bold text-lg text-gray-900 mt-0.5">{viewingTask.videoName}</h3>
              </div>
              <button onClick={() => setViewingTask(null)} className="p-1 hover:bg-gray-150 rounded cursor-pointer">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs text-gray-700">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-5 border-b border-gray-100">
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-0.5">Client</span>
                  <span className="font-semibold text-gray-900 block">{viewingTask.clientName}</span>
                  <span className="font-mono text-gray-400 block">{viewingTask.clientPhone}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-0.5">Financial Price Tag</span>
                  <span className="font-bold text-gray-900 block">₹{viewingTask.price}</span>
                  <span className="font-mono text-gray-400 block">Adv: ₹{viewingTask.advance} (Date: {viewingTask.advReceivedDate || '-'})</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-0.5">Outstanding Balance</span>
                  <span className="font-bold text-gray-900 block font-mono">₹{viewingTask.balance}</span>
                  <span className={`text-[10px] font-bold block ${viewingTask.balanceReceived === 'Yes' ? 'text-green-700' : 'text-amber-700'}`}>
                    Received: {viewingTask.balanceReceived} {viewingTask.balRecDate && `(${viewingTask.balRecDate})`}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-5 border-b border-gray-100">
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-0.5">Issued To Whom</span>
                  <span className="font-semibold text-gray-900">{viewingTask.issuedToWhom}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-0.5">Payable to Creator</span>
                  <span className="font-bold text-gray-900 font-mono">₹{viewingTask.payableAmountToCreator}</span>
                  <span className={`text-[10px] font-bold block ${viewingTask.paidToCreator === 'Yes' ? 'text-green-700' : 'text-amber-700'}`}>
                    Paid Creator: {viewingTask.paidToCreator} {viewingTask.paidToCreatorDate && `(${viewingTask.paidToCreatorDate})`}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-0.5">Order Status</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    viewingTask.orderStatus === 'Completed' ? 'bg-green-100 text-green-800' :
                    viewingTask.orderStatus === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                    'bg-amber-100 text-amber-805'
                  }`}>{viewingTask.orderStatus}</span>
                </div>
              </div>

              {/* Script Viewer box */}
              <div className="space-y-1.5">
                <span className="block text-[10px] font-bold text-gray-400 uppercase">Interactive Video Script</span>
                <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg max-h-[140px] overflow-y-auto whitespace-pre-wrap font-sans text-gray-700 leading-relaxed font-normal">
                  {viewingTask.script || 'No script assigned yet.'}
                </div>
              </div>

              {/* Split Reference and Sample files view for better organization */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                {/* Admin Given Samples Section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-blue-600 rounded-xs"></span>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Admin Given Samples / References</span>
                  </div>
                  {viewingTask.sampleFiles && viewingTask.sampleFiles.filter((f: any) => f.uploadedBy === 'Admin').length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {viewingTask.sampleFiles.filter((f: any) => f.uploadedBy === 'Admin').map((file: any) => (
                        <div key={file.id} className="p-3 bg-blue-50/35 border border-blue-100/70 rounded-xl flex items-center justify-between gap-2">
                          <div className="truncate">
                            <span className="font-semibold text-gray-800 truncate block text-xs">{file.name}</span>
                            <span className="text-[10px] text-gray-400 block font-mono">{(file.size / (1024 * 1024)).toFixed(2)} MB • Admin</span>
                          </div>
                          <div className="flex gap-2">
                            <a href={getFileViewUrl(file)} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-500 hover:text-gray-900" title="Direct download/preview">
                              <Download className="h-4 w-4" />
                            </a>
                            <a href={file.driveUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-blue-500 hover:text-blue-700" title="Open Google Drive folder">
                              <Link className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="block p-3 text-center text-gray-400 font-mono text-[11px] bg-slate-50/50 rounded-lg border border-dashed border-slate-100">No Admin-uploaded references.</span>
                  )}
                </div>

                {/* User/Member Given Samples Section */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-indigo-600 rounded-xs"></span>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">User Given Samples / Briefs</span>
                  </div>
                  {viewingTask.sampleFiles && viewingTask.sampleFiles.filter((f: any) => f.uploadedBy !== 'Admin').length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {viewingTask.sampleFiles.filter((f: any) => f.uploadedBy !== 'Admin').map((file: any) => (
                        <div key={file.id} className="p-3 bg-indigo-50/35 border border-indigo-100/70 rounded-xl flex items-center justify-between gap-2">
                          <div className="truncate">
                            <span className="font-semibold text-gray-800 truncate block text-xs">{file.name}</span>
                            <span className="text-[10px] text-gray-400 block font-mono">{(file.size / (1024 * 1024)).toFixed(2)} MB • User</span>
                          </div>
                          <div className="flex gap-2">
                            <a href={getFileViewUrl(file)} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-500 hover:text-gray-900" title="Direct download/preview">
                              <Download className="h-4 w-4" />
                            </a>
                            <a href={file.driveUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-blue-500 hover:text-blue-700" title="Open Google Drive folder">
                              <Link className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="block p-3 text-center text-gray-400 font-mono text-[11px] bg-slate-50/50 rounded-lg border border-dashed border-slate-100">No User-uploaded samples.</span>
                  )}
                </div>
              </div>

              {/* Final output videos uploaded by user, dynamically mapped based on client */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <span className="block text-[10px] font-bold text-gray-400 uppercase">Creator Completed Videos (stored in Google Drive / Clients / {viewingTask.clientName})</span>
                {viewingTask.finalVideos && viewingTask.finalVideos.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {viewingTask.finalVideos.map((file: any) => (
                      <div key={file.id} className="p-3 bg-white border border-gray-155 rounded-xl flex items-center justify-between gap-2">
                        <div className="truncate">
                          <span className="font-semibold text-gray-800 truncate block text-xs">{file.name}</span>
                          <span className="text-[10px] text-gray-400 block font-mono">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                        <div className="flex gap-2">
                          <a href={getFileViewUrl(file)} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-500 hover:text-gray-900" title="Direct download/preview">
                            <Download className="h-4 w-4" />
                          </a>
                          <a href={file.driveUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-blue-500 hover:text-blue-700" title="Open shareable Drive link">
                            <Link className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="block p-3 text-center text-gray-400 font-mono italic">No final delivered outputs.</span>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Send WhatsApp to Client */}
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => triggerWhatsApp(viewingTask.clientPhone, viewingTask)}
                    className={`px-4 py-2 border rounded-lg cursor-pointer transition-all flex items-center gap-2 text-xs font-semibold ${
                      shouldShowWhatsAppIndicator(viewingTask)
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : 'text-slate-700 bg-white hover:bg-slate-50 border-slate-200 hover:text-emerald-600'
                    }`}
                    title="Send WhatsApp to Client"
                  >
                    <Phone className="h-4 w-4" />
                    <span>Send WhatsApp to Client</span>
                  </button>
                  {shouldShowWhatsAppIndicator(viewingTask) && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 pointer-events-none">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                  )}
                </div>

                {/* Send Task details to Creator via WhatsApp */}
                <button
                  type="button"
                  onClick={() => triggerWhatsAppToCreator(viewingTask)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-600 border border-slate-200 rounded-lg cursor-pointer transition-all flex items-center gap-2 text-xs font-semibold"
                  title="Send Task details to Creator via WhatsApp"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Send Task Details to Creator via WhatsApp</span>
                </button>
              </div>

              <button
                onClick={() => setViewingTask(null)}
                className="px-4 py-2 bg-gray-950 hover:bg-gray-900 text-white rounded-lg font-semibold cursor-pointer text-xs"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG FOR CLEARED & PAID STATUS CHANGES */}
      {confirmAction && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-100 flex-col">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-150 max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100/60 shadow-3xs flex-shrink-0">
                <AlertTriangle className="h-5 w-5 stroke-[2.25]" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Confirm Change</h4>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wide">Action confirmation required</p>
              </div>
            </div>
            
            <p className="text-slate-700 text-[13px] font-medium leading-relaxed mb-6">
              Are you sure want to do that?
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-xs font-bold text-slate-650 bg-slate-100/85 hover:bg-slate-200/90 hover:text-slate-800 rounded-xl transition-all cursor-pointer border border-slate-200 outline-none"
              >
                No
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { type, taskId, nextValue } = confirmAction;
                  if (type === 'cleared') {
                    await updateTaskInline(taskId, {
                      balanceReceived: nextValue,
                      balRecDate: nextValue === 'Yes' ? getTodaysDateStr() : ''
                    });
                  } else if (type === 'paid') {
                    await updateTaskInline(taskId, {
                      paidToCreator: nextValue,
                      paidToCreatorDate: nextValue === 'Yes' ? getTodaysDateStr() : ''
                    });
                  }
                  setConfirmAction(null);
                }}
                className="px-5 py-2 text-xs font-extrabold text-white bg-slate-900 hover:bg-black rounded-xl shadow-md cursor-pointer transition-all border border-slate-950 hover:shadow-lg outline-none"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TASK BULK IMPORT & BACKUP MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-gray-950/45 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-150 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Database Update, Import & Backup</h3>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="p-1 rounded hover:bg-gray-100 cursor-pointer">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs text-gray-700">
              {/* SECTION 1: SYSTEM EXPORTS */}
              <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl space-y-3">
                <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wide">1. Export and Backup Records</h4>
                <p className="text-slate-500 leading-relaxed">
                  Always download a complete backup of your tasks before updates, so you can easily restore your data later.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="flex items-center justify-center gap-2 p-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    <Download className="h-4 w-4 text-slate-500" />
                    <div>
                      <div className="font-bold text-left">Export CSV Spreadsheet</div>
                      <div className="text-[10px] font-normal text-slate-400 text-left">Perfect for Excel / Sheets</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJSON}
                    className="flex items-center justify-center gap-2 p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <div>
                      <div className="font-bold text-left">Export JSON System Backup</div>
                      <div className="text-[10px] font-normal text-emerald-500 text-left text-left">Loss-less full system dump</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* SECTION 2: SYSTEM IMPORTS */}
              <div className="space-y-4">
                <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wide">2. Live Import / Restore Task Ledger</h4>
                <p className="text-slate-500 leading-relaxed">
                  Support backups created in this application (CSV or JSON formats). Tasks with matching IDs (e.g. TV-XXXXXX) will update existing entries, while new IDs will create new pipelines!
                </p>

                {/* Upload Zone */}
                <div className="border-2 border-dashed border-slate-200 hover:border-emerald-300 rounded-xl p-6 bg-white text-center transition-colors relative">
                  <input
                    type="file"
                    accept=".json,.csv"
                    onChange={handleImportFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="space-y-2 pointer-events-none">
                    <div className="flex justify-center">
                      <Upload className="h-8 w-8 text-slate-400" />
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Click to upload backup file</span> or drag & drop files here
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Supports only .csv and .json exported from the system
                    </div>
                  </div>
                </div>

                {/* File Parsing Results / Instructions */}
                {importFile && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 block">Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)</span>
                      <button 
                        type="button" 
                        onClick={() => {
                          setImportFile(null);
                          setImportStatus('idle');
                          setImportLog('');
                          setParsedTasks([]);
                        }}
                        className="text-[10px] text-red-500 font-semibold hover:underline"
                      >
                        Clear
                      </button>
                    </div>

                    {importStatus === 'parsing' && (
                      <div className="flex items-center gap-2 text-slate-500 font-semibold">
                        <Loader2 className="animate-spin h-4 w-4" />
                        <span>Analyzing database structure...</span>
                      </div>
                    )}

                    {importStatus === 'ready' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                          <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg text-blue-700">
                            <span className="block font-bold text-base">{parsedImportCount.created}</span>
                            New Tasks Created
                          </div>
                          <div className="p-2 bg-amber-50 border border-amber-100 rounded-lg text-amber-700">
                            <span className="block font-bold text-base">{parsedImportCount.updated}</span>
                            Existing Updated
                          </div>
                          <div className="p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-700">
                            <span className="block font-bold text-base">{parsedImportCount.total}</span>
                            Total Analyzed
                          </div>
                        </div>

                        <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg text-[11px] leading-relaxed">
                          {importLog}
                        </div>
                      </div>
                    )}

                    {(importStatus === 'success' || importStatus === 'error') && (
                      <div className={`p-3 rounded-lg text-[11px] leading-relaxed font-semibold {
                        importStatus === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                      }`}>
                        {importLog}
                      </div>
                    )}

                    {importStatus === 'importing' && (
                      <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-100 font-semibold">
                        <Loader2 className="animate-spin h-4 w-4" />
                        <span>Sending payload to backend server...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* SECTION 3: DANGER ZONE - PRE-EMPTIVE CLEAN RESET */}
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
                <h4 className="font-bold text-xs uppercase text-red-600 tracking-wide font-sans">3. Danger Zone: Live Reset Database</h4>
                <p className="text-red-500 leading-relaxed">
                  Permanently delete all pipeline tasks, creator payout references, and operational expense entries. This action cannot be undone and will overwrite your deep cloud Firestore state as well.
                </p>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={handleResetDatabase}
                    disabled={resetStep === 'resetting'}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-white text-xs font-bold shadow rounded-lg transition-all border-none outline-none cursor-pointer ${
                      resetStep === 'idle' 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : resetStep === 'confirm' 
                          ? 'bg-amber-600 animate-pulse hover:bg-amber-700' 
                          : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>
                      {resetStep === 'idle' && 'Reset & Clear Entire Database'}
                      {resetStep === 'confirm' && 'Are you sure? Click to Confirm Clear!'}
                      {resetStep === 'resetting' && 'Purging system...'}
                    </span>
                  </button>
                  {resetStep === 'confirm' && (
                    <button
                      type="button"
                      onClick={() => setResetStep('idle')}
                      className="ml-3 text-xs text-slate-500 font-semibold hover:underline outline-none border-none bg-transparent cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 border border-gray-200 bg-white rounded-xl font-semibold cursor-pointer hover:bg-gray-100"
              >
                Close Window
              </button>

              <button
                type="button"
                disabled={importStatus !== 'ready'}
                onClick={submitImport}
                className={`px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all border outline-none ${
                  importStatus === 'ready'
                    ? 'text-white bg-slate-900 border-slate-950 hover:bg-black'
                    : 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed shadow-none'
                }`}
              >
                Confirm & Import Records
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DYNAMIC FORM MODAL FOR CREATE & EDIT TASKS */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-gray-950/45 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-150 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">{editingTask ? `Edit Task Reference: ${editingTask.id}` : 'Create New Client Video Task'}</h3>
              <button onClick={() => setIsTaskModalOpen(false)} className="p-1 rounded hover:bg-gray-100 cursor-pointer">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="p-6 space-y-4 text-xs text-gray-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Client Name with autocomplete suggestions */}
                <div className="space-y-1 relative">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Client Name *</label>
                  <input
                    type="text"
                    required
                    value={taskForm.clientName}
                    onFocus={() => setShowClientSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
                    onChange={(e) => {
                      const typed = e.target.value;
                      // Match auto fill phone
                      const matchingPhone = existingClientsMap[typed];
                      setTaskForm({ 
                        ...taskForm, 
                        clientName: typed,
                        clientPhone: matchingPhone || taskForm.clientPhone 
                      });
                    }}
                    placeholder="Type client name..."
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                  />
                  {showClientSuggestions && uniqueClientNames.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[140px] overflow-y-auto divide-y divide-gray-50 font-sans">
                      {uniqueClientNames
                        .filter(item => item.toLowerCase().includes(taskForm.clientName.toLowerCase()))
                        .map(item => (
                          <button
                            key={item}
                            type="button"
                            onMouseDown={() => {
                              setTaskForm({
                                ...taskForm,
                                clientName: item,
                                clientPhone: existingClientsMap[item] || '919999999999'
                              });
                              setShowClientSuggestions(false);
                            }}
                            className="w-full text-left p-2.5 hover:bg-gray-50 font-medium text-xs text-gray-800 block focus:outline-none"
                          >
                            {item} ({existingClientsMap[item]})
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* Client Phone */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Client Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={taskForm.clientPhone}
                    onChange={(e) => setTaskForm({ ...taskForm, clientPhone: e.target.value })}
                    placeholder="e.g. 919876543201"
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                  />
                </div>

                {/* Category tags with auto tags suggestions */}
                <div className="space-y-1 relative">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Category Tag *</label>
                  <input
                    type="text"
                    required
                    value={taskForm.category}
                    onFocus={() => setShowCategorySuggestions(true)}
                    onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 200)}
                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                    placeholder="Choose or insert style category"
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                  />
                  {showCategorySuggestions && existingCategories.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[120px] overflow-y-auto divide-y divide-gray-50 font-sans">
                      {existingCategories
                        .filter(cat => cat.toLowerCase().includes(taskForm.category.toLowerCase()))
                        .map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onMouseDown={() => {
                              setTaskForm({ ...taskForm, category: cat });
                              setShowCategorySuggestions(false);
                            }}
                            className="w-full text-left p-2.5 hover:bg-gray-50 font-medium text-xs text-gray-805 block focus:outline-none"
                          >
                            {cat}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* Video Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Video Project Title Name *</label>
                  <input
                    type="text"
                    required
                    value={taskForm.videoName}
                    onChange={(e) => setTaskForm({ ...taskForm, videoName: e.target.value })}
                    placeholder="origins of Odisha Arisa..."
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                  />
                </div>

                {/* Task Created Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Task Created Date (Order Date) *</label>
                  <input
                    type="date"
                    required
                    value={ddmmToYyyymmdd(taskForm.orderDate)}
                    onChange={(e) => setTaskForm({ ...taskForm, orderDate: yyyymmddToDdmm(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none font-semibold text-gray-700 font-mono"
                  />
                </div>

                {/* Script Ready */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Script Ready?</label>
                  <select
                    value={taskForm.scriptReady}
                    onChange={(e) => setTaskForm({ ...taskForm, scriptReady: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>

                {/* Creator Assignee */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Assign to Creator Teammate *</label>
                  <select
                    value={taskForm.issuedToWhom}
                    onChange={(e) => setTaskForm({ ...taskForm, issuedToWhom: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none font-semibold text-gray-800"
                  >
                    <option value="">-- Choose Assigned Creator --</option>
                    {users.filter(u => u.role === 'Member' || u.userId !== 'TemplatesvillaRDA').map((item) => (
                      <option key={item.userId} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                </div>

                {/* Price Final Amount */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Price (Final Billing Cost) *</label>
                  <input
                    type="number"
                    required
                    value={taskForm.price || ''}
                    onChange={(e) => {
                      const p = Number(e.target.value);
                      setTaskForm({ ...taskForm, price: p, balance: p - taskForm.advance });
                    }}
                    placeholder="₹ in Rupees"
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none font-mono font-bold"
                  />
                </div>

                {/* Advance Amount */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Advance Payment Received</label>
                  <input
                    type="number"
                    value={taskForm.advance || ''}
                    onChange={(e) => {
                      const adv = Number(e.target.value);
                      setTaskForm({ ...taskForm, advance: adv, balance: taskForm.price - adv });
                    }}
                    placeholder="₹ in Rupees"
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none font-mono"
                  />
                </div>

                {/* Advance Received Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Advance Received Date</label>
                  <input
                    type="text"
                    value={taskForm.advReceivedDate}
                    onChange={(e) => setTaskForm({ ...taskForm, advReceivedDate: e.target.value })}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                  />
                </div>

                {/* Balance Received Yes/no */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Balance Settled?</label>
                  <select
                    value={taskForm.balanceReceived}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      const updates: Partial<any> = { balanceReceived: val };
                      if (val === 'Yes' && !taskForm.balRecDate) {
                        updates.balRecDate = getTodaysDateStr();
                      } else if (val === 'No') {
                        updates.balRecDate = '';
                      }
                      setTaskForm({ ...taskForm, ...updates });
                    }}
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>

                {/* Bal. Rec. Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Balance Received Date</label>
                  <input
                    type="text"
                    value={taskForm.balRecDate}
                    onChange={(e) => setTaskForm({ ...taskForm, balRecDate: e.target.value })}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                  />
                </div>

                {/* Payable To Creator amount */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Payable Compensation to Creator *</label>
                  <input
                    type="number"
                    required
                    value={taskForm.payableAmountToCreator || ''}
                    onChange={(e) => setTaskForm({ ...taskForm, payableAmountToCreator: Number(e.target.value) })}
                    placeholder="₹ in Rupees"
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none font-mono"
                  />
                </div>

                {/* Paid to Creator Yes/No */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Creator Compensation Paid?</label>
                  <select
                    value={taskForm.paidToCreator}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      const updates: Partial<any> = { paidToCreator: val };
                      if (val === 'Yes' && !taskForm.paidToCreatorDate) {
                        updates.paidToCreatorDate = getTodaysDateStr();
                      } else if (val === 'No') {
                        updates.paidToCreatorDate = '';
                      }
                      setTaskForm({ ...taskForm, ...updates });
                    }}
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                  >
                    <option value="No">No (Unreleased)</option>
                    <option value="Yes">Yes (Cleared)</option>
                  </select>
                </div>

                {/* Paid to Creator Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Payments Paid date</label>
                  <input
                    type="text"
                    value={taskForm.paidToCreatorDate}
                    onChange={(e) => setTaskForm({ ...taskForm, paidToCreatorDate: e.target.value })}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                  />
                </div>

                {/* Order Status */}
                <div className={`${taskForm.orderStatus === 'Completed' ? 'sm:col-span-2' : 'col-span-1'} space-y-1`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase block">Current Order Status</label>
                      <select
                        value={taskForm.orderStatus}
                        onChange={(e) => {
                          const newStatus = e.target.value as any;
                          const updates: Partial<any> = { orderStatus: newStatus };
                          if (newStatus === 'Completed' && !taskForm.deliveryDate) {
                            const now = new Date();
                            const day = String(now.getDate()).padStart(2, "0");
                            const month = String(now.getMonth() + 1).padStart(2, "0");
                            const year = now.getFullYear();
                            updates.deliveryDate = `${day}/${month}/${year}`;
                          } else if (newStatus !== 'Completed') {
                            updates.deliveryDate = '';
                          }
                          setTaskForm({ ...taskForm, ...updates });
                        }}
                        className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none font-semibold text-gray-800"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                    {taskForm.orderStatus === 'Completed' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase block">Date Completed</label>
                        <input
                          type="text"
                          value={taskForm.deliveryDate}
                          onChange={(e) => setTaskForm({ ...taskForm, deliveryDate: e.target.value })}
                          placeholder="DD/MM/YYYY"
                          className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none font-semibold text-gray-805 font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Script box content */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase block">Pasted Video Script</label>
                <textarea
                  value={taskForm.script}
                  onChange={(e) => setTaskForm({ ...taskForm, script: e.target.value })}
                  placeholder="Paste script text paragraphs here..."
                  className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none min-h-[90px] font-normal"
                />
              </div>

              {/* Show Existing Attached Reference Files (for Edit Task Mode) */}
              {editingTask && editingTask.sampleFiles && editingTask.sampleFiles.length > 0 && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  {/* Admin Reference Files subclass group */}
                  {editingTask.sampleFiles.filter((f: any) => f.uploadedBy === 'Admin').length > 0 && (
                    <div className="space-y-2">
                      <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Existing Admin Given References
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {editingTask.sampleFiles.filter((f: any) => f.uploadedBy === 'Admin').map((file: any) => (
                          <div key={file.id} className="p-2 px-3 bg-blue-50/40 border border-blue-150 rounded-lg flex items-center justify-between gap-2 text-xs">
                            <div className="truncate text-left">
                              <span className="font-semibold text-slate-700 truncate block">{file.name}</span>
                              <span className="text-[9px] text-slate-400 font-mono">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                            </div>
                            <div className="flex gap-1.5">
                              <a href={getFileViewUrl(file)} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-slate-600" title="Download">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (window.confirm(`Are you sure you want to delete "${file.name}"?`)) {
                                    try {
                                      const updatedSampleFiles = editingTask.sampleFiles.filter((f: any) => f.id !== file.id);
                                      const updatedTask = { ...editingTask, sampleFiles: updatedSampleFiles };
                                      
                                      const response = await fetch(`/api/tasks/${editingTask.id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(updatedTask),
                                      });
                                      const data = await response.json();
                                      if (response.ok && data.success) {
                                        setTasks(data.tasks);
                                        setEditingTask(data.task);
                                      }
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }
                                }}
                                className="p-1 text-red-400 hover:text-red-500 hover:bg-red-50 rounded"
                                title="Delete attachment"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* User Reference Files subclass group */}
                  {editingTask.sampleFiles.filter((f: any) => f.uploadedBy !== 'Admin').length > 0 && (
                    <div className="space-y-2">
                      <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Existing User Given Samples
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {editingTask.sampleFiles.filter((f: any) => f.uploadedBy !== 'Admin').map((file: any) => (
                          <div key={file.id} className="p-2 px-3 bg-indigo-50/40 border border-indigo-150 rounded-lg flex items-center justify-between gap-2 text-xs">
                            <div className="truncate text-left">
                              <span className="font-semibold text-slate-700 truncate block">{file.name}</span>
                              <span className="text-[9px] text-slate-400 font-mono">{(file.size / (1024 * 1024)).toFixed(2) } MB</span>
                            </div>
                            <div className="flex gap-1.5">
                              <a href={getFileViewUrl(file)} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-slate-600" title="Download">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (window.confirm(`Are you sure you want to delete "${file.name}"?`)) {
                                    try {
                                      const updatedSampleFiles = editingTask.sampleFiles.filter((f: any) => f.id !== file.id);
                                      const updatedTask = { ...editingTask, sampleFiles: updatedSampleFiles };
                                      
                                      const response = await fetch(`/api/tasks/${editingTask.id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(updatedTask),
                                      });
                                      const data = await response.json();
                                      if (response.ok && data.success) {
                                        setTasks(data.tasks);
                                        setEditingTask(data.task);
                                      }
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }
                                }}
                                className="p-1 text-red-400 hover:text-red-500 hover:bg-red-50 rounded"
                                title="Delete attachment"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Option for Attachment in create task / edit task */}
              <div className="space-y-2 pt-2 border-t border-gray-150">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">
                    Upload & Attach Task Reference Files (Images, briefs, assets)
                  </label>
                  {selectedTaskFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedTaskFiles([])}
                      className="text-[10px] text-red-500 hover:text-red-700 font-bold transition-all"
                    >
                      Clear All Selected ({selectedTaskFiles.length})
                    </button>
                  )}
                </div>
                
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-200 hover:border-blue-600 rounded-xl cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-all">
                    <div className="flex flex-col items-center justify-center pt-2 pb-2 px-4 text-center">
                      <p className="text-xs text-slate-500 font-semibold mb-1">
                        <span className="text-blue-600 font-bold">Configure attachments</span> - click to add sample documents
                      </p>
                      <p className="text-[9px] text-slate-400 font-mono uppercase tracking-widest">
                        Support multiple reference file selection
                      </p>
                    </div>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          const filesArr = Array.from(e.target.files);
                          setSelectedTaskFiles((prev) => [...prev, ...filesArr]);
                        }
                      }}
                    />
                  </label>
                </div>

                {/* Selected Files List preview with individual check or remove buttons */}
                {selectedTaskFiles.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {selectedTaskFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-xs shadow-xs"
                      >
                        <div className="truncate flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          <div className="truncate text-left">
                            <p className="font-bold text-slate-700 truncate">{file.name}</p>
                            <p className="text-[9px] text-slate-400 font-mono">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTaskFiles((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="p-1 rounded-full text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {uploadingTaskFiles && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg flex items-center gap-2 text-xs font-semibold">
                  <Loader2 className="animate-spin h-4 w-4 text-blue-600" />
                  <span>{adminUploadProgress ? `Transferring attachments: ${adminUploadProgress}` : "Transferring attachment files directly to Root/Sample Folder... Please wait."}</span>
                </div>
              )}

              <div className="p-3 border-t border-gray-150 text-right space-x-2 pt-5">
                <button
                  type="button"
                  disabled={uploadingTaskFiles}
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 rounded-lg font-semibold cursor-pointer"
                >
                  Close Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingTaskFiles}
                  className="px-4 py-2 bg-gray-950 text-white hover:bg-gray-900 disabled:opacity-50 rounded-lg font-semibold cursor-pointer inline-flex items-center gap-1.5"
                >
                  {uploadingTaskFiles ? (
                    <>
                      <Loader2 className="animate-spin h-3.5 w-3.5" />
                      Saving & Uploading {adminUploadProgress ? `(${adminUploadProgress})` : ""}...
                    </>
                  ) : (
                    'Save Task Reference'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CLIENT DETAILS MODAL */}
      {isClientEditModalOpen && (
        <div className="fixed inset-0 bg-gray-950/45 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-150 max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Edit Client Information</h3>
              <button onClick={() => { setIsClientEditModalOpen(false); setEditingClientOriginalName(null); }} className="p-1 rounded hover:bg-gray-100 cursor-pointer">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleUpdateClient} className="p-6 space-y-4 text-xs text-gray-700">
              <div className="space-y-4">
                <div className="bg-blue-50/50 text-blue-800 p-3 rounded-xl border border-blue-100 text-[11px] leading-relaxed">
                  Editing client <strong className="font-bold">{editingClientOriginalName}</strong>. This will automatically update the client's name and contact number across all historical and current tasks synchronously.
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Client Name *</label>
                  <input
                    type="text"
                    required
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-blue-500 focus:bg-white"
                    placeholder="Enter Client Name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Phone / WhatsApp Number</label>
                  <input
                    type="text"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-blue-500 focus:bg-white font-mono"
                    placeholder="e.g. 919999999999"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={updatingClient}
                  onClick={() => { setIsClientEditModalOpen(false); setEditingClientOriginalName(null); }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 rounded-lg font-semibold block cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingClient || !newClientName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 rounded-lg font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {updatingClient ? (
                    <>
                      <Loader2 className="animate-spin h-3.5 w-3.5" />
                      Updating Client...
                    </>
                  ) : (
                    'Save Client Details'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TASK DELETION CONFIRMATION MODAL */}
      {taskToDelete && (
        <div className="fixed inset-0 bg-gray-950/45 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-150 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-red-100 bg-red-50/30 flex justify-between items-center">
              <div className="flex items-center gap-2 text-red-650">
                <AlertTriangle className="h-5 w-5 stroke-[2.25] text-red-650" />
                <h3 className="font-bold text-sm text-red-800 uppercase tracking-wider">Delete Task Pipeline</h3>
              </div>
              <button 
                onClick={() => setTaskToDelete(null)} 
                className="p-1 rounded hover:bg-gray-100 cursor-pointer"
                disabled={isDeletingTask}
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-gray-700">
              <div className="space-y-3">
                <p className="text-[13px] font-medium leading-relaxed">
                  Are you sure you want to permanently delete this task pipeline? This action cannot be undone.
                </p>

                <div className="p-4 bg-gray-50 rounded-xl border border-gray-150 space-y-2.5 font-sans">
                  <div className="flex justify-between border-b border-gray-100 pb-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Task ID</span>
                    <span className="font-mono font-bold text-slate-800">{taskToDelete.id}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Client Name</span>
                    <span className="font-semibold text-slate-800">{taskToDelete.clientName}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Video Topic</span>
                    <span className="font-semibold text-slate-800 text-right max-w-[200px] truncate" title={taskToDelete.videoName}>
                      {taskToDelete.videoName}
                    </span>
                  </div>
                  <div className="flex justify-between pb-0.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Total Price</span>
                    <span className="font-mono font-bold text-slate-800">₹{taskToDelete.price.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeletingTask}
                  onClick={() => setTaskToDelete(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded-lg font-semibold block cursor-pointer transition-all"
                >
                  Cancel, Keep
                </button>
                <button
                  type="button"
                  disabled={isDeletingTask}
                  onClick={handleDeleteTaskConfirm}
                  className="px-4 py-2 bg-red-650 hover:bg-red-750 text-white disabled:opacity-50 rounded-lg font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                >
                  {isDeletingTask ? (
                    <>
                      <Loader2 className="animate-spin h-3.5 w-3.5" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      Permanently Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OTHER CORPORATE EXPENSE DELETION CONFIRMATION MODAL */}
      {expenseToDelete && (
        <div className="fixed inset-0 bg-gray-950/45 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-150 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-red-100 bg-red-50/30 flex justify-between items-center">
              <div className="flex items-center gap-2 text-red-650">
                <AlertTriangle className="h-5 w-5 stroke-[2.25] text-red-650" />
                <h3 className="font-bold text-sm text-red-800 uppercase tracking-wider">Delete Operating Expense</h3>
              </div>
              <button 
                onClick={() => setExpenseToDelete(null)} 
                className="p-1 rounded hover:bg-gray-100 cursor-pointer"
                disabled={isDeletingExpense}
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-gray-700">
              <div className="space-y-3">
                <p className="text-[13px] font-medium leading-relaxed font-sans">
                  Are you sure you want to permanently delete this operational expense? This action cannot be undone.
                </p>

                <div className="p-4 bg-gray-50 rounded-xl border border-gray-150 space-y-2.5 font-sans">
                  <div className="flex justify-between border-b border-gray-100 pb-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Expense ID</span>
                    <span className="font-mono font-bold text-slate-800">{expenseToDelete.id}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Description</span>
                    <span className="font-semibold text-slate-800">{expenseToDelete.description}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Date</span>
                    <span className="font-semibold text-slate-800">{expenseToDelete.date}</span>
                  </div>
                  <div className="flex justify-between pb-0.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Amount</span>
                    <span className="font-mono font-bold text-red-600">₹{expenseToDelete.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeletingExpense}
                  onClick={() => setExpenseToDelete(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded-lg font-semibold block cursor-pointer transition-all"
                >
                  Cancel, Keep
                </button>
                <button
                  type="button"
                  disabled={isDeletingExpense}
                  onClick={handleDeleteExpenseConfirm}
                  className="px-4 py-2 bg-red-650 hover:bg-red-750 text-white disabled:opacity-50 rounded-lg font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                >
                  {isDeletingExpense ? (
                    <>
                      <Loader2 className="animate-spin h-3.5 w-3.5" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      Permanently Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE DRIVE CONNECT MODAL */}
      {showDriveConnectModal && (
        <div className="fixed inset-0 bg-gray-950/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
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
              <button type="button" onClick={handleConnectDrive} className="text-blue-600 hover:text-blue-800 font-extrabold normal-case underline ml-1.5 cursor-pointer">Connect Google Drive</button>
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
    </div>
  );
}
