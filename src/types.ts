export type OrderStatus = 'Pending' | 'In Progress' | 'Completed';

export interface Task {
  id: string; // Unique ID (e.g., T-1001)
  orderDate: string; // DD/MM/YYYY
  deliveryDate?: string; // DD/MM/YYYY
  clientName: string;
  clientPhone: string;
  category: string;
  videoName: string;
  scriptReady: 'Yes' | 'No';
  price: number; // Final Amount
  advance: number; // Adv. Received
  advReceivedDate?: string; // Adv. Rev Date
  balance: number; // (Price - Advance) or custom
  balanceReceived: 'Yes' | 'No';
  balRecDate?: string; // Bal. Rec. Date
  issuedToWhom: string; // Creator name (e.g. Bhutesh, Dev, Pintu, Sahil)
  orderStatus: OrderStatus;
  paidToCreator: 'Yes' | 'No';
  payableAmountToCreator: number;
  paidToCreatorDate?: string; // Date paid to creator
  script: string;
  sampleFiles: UploadedFile[]; // User uploads
  finalVideos: UploadedFile[]; // Final video uploads
  otherExpenses?: Expense[];
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  path: string; // direct path to download from our server
  driveUrl: string; // mock shareable Google Drive link
  uploadedBy?: 'Admin' | 'User';
}

export interface UserCredentials {
  userId: string;
  passwordHash: string; // For our application, we will store passwords directly or simple hashes
  role: 'Admin' | 'Member';
  name: string;
  phone?: string;
}

export interface ClientLedgerEntry {
  taskId: string;
  videoName: string;
  date: string;
  description: string;
  charged: number;
  paid: number;
  balance: number;
}

export interface CreatorLedgerEntry {
  taskId: string;
  videoName: string;
  date: string;
  description: string;
  earned: number;
  paid: number;
  balance: number;
}
