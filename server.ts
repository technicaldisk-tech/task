import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const app = express();
const PORT = 3000;

// Initialize Firebase for persistent storage
const CONFIG_FILE = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseApp: any = null;
let firestoreDb: any = null;

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const firebaseConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    firebaseApp = initializeApp(firebaseConfig);
    const dbId = firebaseConfig.firestoreDatabaseId;
    firestoreDb = dbId ? getFirestore(firebaseApp, dbId) : getFirestore(firebaseApp);
    console.log(`Firebase initialized successfully inside server.ts. Database ID: ${dbId || "(default)"}`);
  } catch (err) {
    console.error("Failed to initialize Firebase:", err);
  }
} else {
  console.log("No firebase-applet-config.json found. Operating in local mode.");
}

// Setup Middleware
app.use(express.json({ limit: "1000mb" }));
app.use(express.urlencoded({ limit: "1000mb", extended: true }));

// Ensure directories exist
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
const SAMPLE_DIR = path.join(UPLOADS_DIR, "sample_files");
const CLIENTS_DIR = path.join(UPLOADS_DIR, "clients");

[DATA_DIR, UPLOADS_DIR, SAMPLE_DIR, CLIENTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const isFinal = req.query.type === "final";
    const clientName = (req.query.clientName as string) || "Unknown_Client";
    const cleanClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, "_");

    if (isFinal) {
      const clientFolderPath = path.join(CLIENTS_DIR, cleanClientName);
      if (!fs.existsSync(clientFolderPath)) {
        fs.mkdirSync(clientFolderPath, { recursive: true });
      }
      cb(null, clientFolderPath);
    } else {
      cb(null, SAMPLE_DIR);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

// Define initial seed data
const initialUsers = [
  {
    userId: "TemplatesvillaRDA",
    passwordHash: "Templatesvilla2026$#",
    role: "Admin",
    name: "System Admin"
  },
  {
    userId: "Bhutesh",
    passwordHash: "creator123",
    role: "Member",
    name: "Bhutesh"
  },
  {
    userId: "Dev",
    passwordHash: "creator123",
    role: "Member",
    name: "Dev"
  },
  {
    userId: "Pintu",
    passwordHash: "creator123",
    role: "Member",
    name: "Pintu"
  },
  {
    userId: "Sahil",
    passwordHash: "creator123",
    role: "Member",
    name: "Sahil"
  }
];

// Map client named key-values for phones
const clientPhones: Record<string, string> = {
  "Tirtha Agency": "919876543201",
  "Websnake": "919876543202",
  "Puspa Clinic": "919876543203",
  "Sahu Pay Digital": "919876543204",
  "Default": "919999999999"
};

// Initial 30 tasks from details
const rawCSVData = [
  { orderDate: "17/05/2026", deliveryDate: "17/05/2026", clientName: "Tirtha Agency", category: "Food", videoName: "Origins of Odisha Arisa Pitha 01", scriptReady: "Yes", price: 700, advance: 0, advReceivedDate: "", balance: 700, balRecDate: "", balanceReceived: "No", issuedToWhom: "Bhutesh", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "18/05/2026", deliveryDate: "18/05/2026", clientName: "Websnake", category: "Food", videoName: "Tulsi Atta", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 800, balRecDate: "20/05/2026", balanceReceived: "Yes", issuedToWhom: "Bhutesh", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "18/05/2026", deliveryDate: "18/05/2026", clientName: "Tirtha Agency", category: "WhatsApp API", videoName: "Swasti Avatar 02", scriptReady: "Yes", price: 600, advance: 0, advReceivedDate: "", balance: 600, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 350, paidToCreatorDate: "" },
  { orderDate: "18/05/2026", deliveryDate: "18/05/2026", clientName: "Tirtha Agency", category: "Travel", videoName: "New Landmark Travel Tarini 05", scriptReady: "Yes", price: 1000, advance: 0, advReceivedDate: "", balance: 1000, balRecDate: "", balanceReceived: "No", issuedToWhom: "Pintu", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "18/05/2026", deliveryDate: "20/05/2026", clientName: "Puspa Clinic", category: "Healhtcare", videoName: "Puspa Clinic Piles Odia", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 600, balRecDate: "21/05/2026", balanceReceived: "Yes", issuedToWhom: "Sahil", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 350, paidToCreatorDate: "" },
  { orderDate: "18/05/2026", deliveryDate: "20/05/2026", clientName: "Puspa Clinic", category: "Healhtcare", videoName: "Puspa Clinic Piles Hindi", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 600, balRecDate: "21/05/2026", balanceReceived: "Yes", issuedToWhom: "Sahil", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 350, paidToCreatorDate: "" },
  { orderDate: "18/05/2026", deliveryDate: "19/05/2026", clientName: "Tirtha Agency", category: "WhatsApp API", videoName: "Swasti Long Video 07", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 800, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "20/05/2026", deliveryDate: "20/05/2026", clientName: "Tirtha Agency", category: "WhatsApp API", videoName: "Swasti AB Company 03", scriptReady: "Yes", price: 700, advance: 0, advReceivedDate: "", balance: 700, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 400, paidToCreatorDate: "" },
  { orderDate: "20/05/2026", deliveryDate: "20/05/2026", clientName: "Tirtha Agency", category: "WhatsApp API", videoName: "Tirtha AB Company 04", scriptReady: "Yes", price: 700, advance: 0, advReceivedDate: "", balance: 700, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 400, paidToCreatorDate: "" },
  { orderDate: "20/05/2026", deliveryDate: "22/05/2026", clientName: "Tirtha Agency", category: "Old Aged Home", videoName: "Harmony Home 09", scriptReady: "Yes", price: 2500, advance: 0, advReceivedDate: "", balance: 2500, balRecDate: "", balanceReceived: "No", issuedToWhom: "Bhutesh", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 2000, paidToCreatorDate: "" },
  { orderDate: "20/05/2026", deliveryDate: "22/05/2026", clientName: "Tirtha Agency", category: "WhatsApp API", videoName: "Swasti 06", scriptReady: "Yes", price: 500, advance: 0, advReceivedDate: "", balance: 500, balRecDate: "", balanceReceived: "No", issuedToWhom: "Sahil", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 250, paidToCreatorDate: "" },
  { orderDate: "20/05/2026", deliveryDate: "23/05/2026", clientName: "Tirtha Agency", category: "Travel", videoName: "New Landmark Travel 10", scriptReady: "No", price: 1000, advance: 0, advReceivedDate: "", balance: 1000, balRecDate: "", balanceReceived: "No", issuedToWhom: "Sahil", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "20/05/2026", deliveryDate: "25/05/2026", clientName: "Websnake", category: "Food", videoName: "Tulsi Chhatua", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 800, balRecDate: "24/05/2026", balanceReceived: "Yes", issuedToWhom: "Bhutesh", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "20/05/2026", deliveryDate: "24/05/2026", clientName: "Websnake", category: "Healthcare", videoName: "Dayarupa Medicines", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 800, balRecDate: "24/05/2026", balanceReceived: "Yes", issuedToWhom: "Pintu", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "20/05/2026", deliveryDate: "22/05/2026", clientName: "Sahu Pay Digital", category: "Mobile Recharge", videoName: "Smart Multie", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 800, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 400, paidToCreatorDate: "" },
  { orderDate: "20/05/2026", deliveryDate: "23/05/2026", clientName: "Sahu Pay Digital", category: "Mobile Recharge", videoName: "Smart Multie", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 800, balRecDate: "", balanceReceived: "No", issuedToWhom: "Pintu", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 400, paidToCreatorDate: "" },
  { orderDate: "22/05/2026", deliveryDate: "22/05/2026", clientName: "Tirtha Agency", category: "Marketing", videoName: "Tirtha Long Video Animate 08", scriptReady: "Yes", price: 700, advance: 0, advReceivedDate: "", balance: 700, balRecDate: "", balanceReceived: "No", issuedToWhom: "Bhutesh", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "24/05/2026", deliveryDate: "24/05/2026", clientName: "Tirtha Agency", category: "Marketing", videoName: "Swast Agency Animate 11", scriptReady: "Yes", price: 700, advance: 0, advReceivedDate: "", balance: 700, balRecDate: "", balanceReceived: "No", issuedToWhom: "Bhutesh", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "24/05/2026", deliveryDate: "24/05/2026", clientName: "Tirtha Agency", category: "Marketing", videoName: "Tirtha Agency Animate 12", scriptReady: "Yes", price: 700, advance: 0, advReceivedDate: "", balance: 700, balRecDate: "", balanceReceived: "No", issuedToWhom: "Bhutesh", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 400, paidToCreatorDate: "" },
  { orderDate: "23/05/2026", deliveryDate: "26/05/2026", clientName: "Puspa Clinic", category: "Ayurvedic Clinic", videoName: "Puspa Clinic Piles", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 600, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 400, paidToCreatorDate: "" },
  { orderDate: "23/05/2026", deliveryDate: "23/05/2026", clientName: "Tirtha Agency", category: "Marketing", videoName: "Swasti Agnecy Double Charecter 14", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 800, balRecDate: "", balanceReceived: "No", issuedToWhom: "Bhutesh", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "23/05/2026", deliveryDate: "26/05/2026", clientName: "Websnake", category: "Healthcare", videoName: "Rameswar Clinic", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 800, balRecDate: "", balanceReceived: "No", issuedToWhom: "Pintu", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "24/05/2026", deliveryDate: "24/05/2026", clientName: "Tirtha Agency", category: "Customer Service", videoName: "Customer Service Window 13", scriptReady: "Yes", price: 700, advance: 0, advReceivedDate: "", balance: 700, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 400, paidToCreatorDate: "" },
  { orderDate: "25/05/2026", deliveryDate: "26/05/2026", clientName: "Tirtha Agency", category: "Institution", videoName: "Ayush Degree College 15", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 800, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "25/05/2026", deliveryDate: "25/05/2026", clientName: "Tirtha Agency", category: "Institution", videoName: "Shree Hari institure of Management", scriptReady: "Yes", price: 700, advance: 0, advReceivedDate: "", balance: 700, balRecDate: "", balanceReceived: "No", issuedToWhom: "Sahil", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 350, paidToCreatorDate: "" },
  { orderDate: "26/05/2026", deliveryDate: "27/05/2026", clientName: "Tirtha Agency", category: "WhatsApp API", videoName: "Tirtha Agency Admission Solution 17", scriptReady: "Yes", price: 700, advance: 0, advReceivedDate: "", balance: 700, balRecDate: "", balanceReceived: "No", issuedToWhom: "Bhutesh", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "27/05/2026", deliveryDate: "28/05/2026", clientName: "Websnake", category: "Healthcare", videoName: "Dayarupa Medicines", scriptReady: "Yes", price: 800, advance: 0, advReceivedDate: "", balance: 800, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 400, paidToCreatorDate: "" },
  { orderDate: "26/05/2026", deliveryDate: "27/05/2026", clientName: "Tirtha Agency", category: "Institution", videoName: "Ayush Degree College 18", scriptReady: "Yes", price: 700, advance: 0, advReceivedDate: "", balance: 700, balRecDate: "", balanceReceived: "No", issuedToWhom: "Bhutesh", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 500, paidToCreatorDate: "" },
  { orderDate: "27/05/2026", deliveryDate: "28/05/2026", clientName: "Tirtha Agency", category: "Institution", videoName: "Shree Hari institure of Management-Avtar 19", scriptReady: "Yes", price: 900, advance: 0, advReceivedDate: "", balance: 900, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 400, paidToCreatorDate: "" },
  { orderDate: "28/05/2026", deliveryDate: "28/05/2026", clientName: "Tirtha Agency", category: "Institution", videoName: "Shre Hari Institute of Management- Avtar-Bed 20", scriptReady: "Yes", price: 900, advance: 0, advReceivedDate: "", balance: 900, balRecDate: "", balanceReceived: "No", issuedToWhom: "Dev", orderStatus: "Completed", paidToCreator: "No", payableAmountToCreator: 400, paidToCreatorDate: "" }
];

const processedTasks = rawCSVData.map((item, idx) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let idValue = "TV-";
  let seed = (idx + 1) * 359;
  for (let i = 0; i < 6; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    idValue += chars.charAt(seed % chars.length);
  }
  const phone = clientPhones[item.clientName] || clientPhones["Default"];
  return {
    id: idValue,
    orderDate: item.orderDate,
    deliveryDate: item.deliveryDate,
    clientName: item.clientName,
    clientPhone: phone,
    category: item.category,
    videoName: item.videoName,
    scriptReady: item.scriptReady as "Yes" | "No",
    price: item.price,
    advance: item.advance,
    advReceivedDate: item.advReceivedDate,
    balance: item.balance,
    balanceReceived: item.balanceReceived as "Yes" | "No",
    balRecDate: item.balRecDate,
    issuedToWhom: item.issuedToWhom,
    orderStatus: item.orderStatus as any,
    paidToCreator: item.paidToCreator as "Yes" | "No",
    payableAmountToCreator: item.payableAmountToCreator,
    paidToCreatorDate: item.paidToCreatorDate,
    script: "This is a preloaded historical task. The script is verified and completed.",
    sampleFiles: [] as any[],
    finalVideos: [] as any[],
    otherExpenses: [] as any[]
  };
});

// Seed JSON helper
function initDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
      tasks: [],
      users: initialUsers,
      expenses: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
    console.log("Database seeded with empty tasks and expenses lists successfully.");
  }
}

initDatabase();

// Firestore saving helper
async function saveDBToFirestore(data: any) {
  if (!firestoreDb) return;
  try {
    const docRef = doc(firestoreDb, "appState", "database");
    await setDoc(docRef, {
      tasks: data.tasks || [],
      users: data.users || [],
      expenses: data.expenses || [],
      googleDriveConfig: data.googleDriveConfig || null,
      notifications: data.notifications || []
    });
    console.log("Database successfully backed up to Firestore.");
  } catch (err) {
    console.error("Failed to back up database to Firestore:", err);
  }
}

// Sync database from Firestore helper on boot
async function syncDatabaseFromFirestore() {
  if (!firestoreDb) {
    console.log("No Firestore database configured. Operating in local-only mode.");
    return;
  }
  try {
    console.log("Checking Firestore for cloud database backup...");
    const docRef = doc(firestoreDb, "appState", "database");
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const cloudData = snapshot.data();
      const localData = {
        tasks: cloudData.tasks || [],
        users: cloudData.users || [],
        expenses: cloudData.expenses || [],
        googleDriveConfig: cloudData.googleDriveConfig || null,
        notifications: cloudData.notifications || []
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(localData, null, 2));
      console.log("Successfully synchronized local database with Firestore cloud state.");
    } else {
      console.log("No cloud database found in Firestore. Backing up current database baseline to cloud...");
      initDatabase();
      const localData = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      await setDoc(docRef, {
        tasks: localData.tasks || [],
        users: localData.users || [],
        expenses: localData.expenses || [],
        googleDriveConfig: localData.googleDriveConfig || null,
        notifications: localData.notifications || []
      });
      console.log("Initial Firestore database cloud backup completed successfully.");
    }
  } catch (err) {
    console.error("Error synchronizing local database with Firestore:", err);
  }
}

// Load & Save db helper
function loadDB() {
  initDatabase();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  return JSON.parse(raw);
}

function saveDB(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  saveDBToFirestore(data).catch((err) => {
    console.error("Background Firestore save error:", err);
  });
}

// REST endpoints

// Login Endpoint
app.post("/api/auth/login", (req, res) => {
  const { userId, password } = req.body;
  const db = loadDB();
  const user = db.users.find(
    (u: any) => u.userId.toLowerCase() === userId?.toString().toLowerCase().trim()
  );

  if (user && user.passwordHash === password) {
    res.json({
      success: true,
      user: {
        userId: user.userId,
        name: user.name,
        role: user.role,
      },
    });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials." });
  }
});

// Shared Google Drive Integration API Endpoints
app.get("/api/drive/config", async (req, res) => {
  try {
    const db = loadDB();
    if (db.googleDriveConfig) {
      const config = db.googleDriveConfig;
      
      // If there is a refreshToken, check if we need to refresh the accessToken.
      // accessToken usually expires in 3600 seconds (1 hour). Let's refresh if updatedAt is older than 45 minutes to be fully safe.
      if (config.refreshToken && config.clientId && config.clientSecret) {
        const lastUpdated = new Date(config.updatedAt || 0).getTime();
        const now = Date.now();
        const minutesElapsed = (now - lastUpdated) / 60000;
        const forceRefresh = req.query.forceRefresh === "true";
        
        if (minutesElapsed >= 45 || forceRefresh) {
          console.log("Refreshing Google Drive access token using refresh token...");
          try {
            const tokenParams = new URLSearchParams({
              client_id: config.clientId,
              client_secret: config.clientSecret,
              refresh_token: config.refreshToken,
              grant_type: "refresh_token"
            });
            
            const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: tokenParams.toString()
            });
            
            if (refreshRes.ok) {
              const tokenData = await refreshRes.json();
              if (tokenData.access_token) {
                config.accessToken = tokenData.access_token;
                config.updatedAt = new Date().toISOString();
                db.googleDriveConfig = config;
                saveDB(db);
                console.log("Successfully refreshed Google Drive access token.");
              }
            } else {
              const errBody = await refreshRes.text();
              console.error("Failed to refresh Google Drive access token:", errBody);
              if (errBody.includes("invalid_grant") || errBody.includes("invalid_request") || refreshRes.status === 400 || refreshRes.status === 401) {
                console.warn("Detecting invalid_grant or invalid credentials. Google has expired or revoked the refresh token on GCP side. Disconnecting stagnant credentials to allow a clean reconnect...");
                delete db.googleDriveConfig;
                saveDB(db);
                return res.json({ success: true, connected: false, error: "Your Google session has expired on GCP side (invalid_grant). Please click 'Connect Google Drive' from your Admin Dashboard to securely reconnect." });
              }
            }
          } catch (refreshErr) {
            console.error("Error standard automatic token refresh:", refreshErr);
          }
        }
      }
      
      res.json({ success: true, connected: true, config: db.googleDriveConfig });
    } else {
      res.json({ success: true, connected: false });
    }
  } catch (err) {
    console.error("Error getting drive config:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// GET endpoint to initiate persistent OAuth 2.0 Web Client consent flow
app.get("/api/drive/auth-initiate", (req, res) => {
  try {
    const { clientId, clientSecret, requesterId, redirectUri } = req.query;
    
    if (!clientId || !clientSecret || !requesterId || !redirectUri) {
      return res.status(400).send("<h3>Missing required OAuth setup parameters.</h3>");
    }
    
    const state = JSON.stringify({
      clientId,
      clientSecret,
      requesterId,
      redirectUri
    });
    
    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", clientId as string);
    googleAuthUrl.searchParams.set("redirect_uri", redirectUri as string);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "https://www.googleapis.com/auth/drive");
    googleAuthUrl.searchParams.set("access_type", "offline");
    googleAuthUrl.searchParams.set("prompt", "consent");
    googleAuthUrl.searchParams.set("state", state);
    
    res.redirect(googleAuthUrl.toString());
  } catch (err) {
    console.error("Error initiating OAuth:", err);
    res.status(500).send("Error initiating OAuth.");
  }
});

// GET callback endpoint to exchange code for persistent refresh credentials
app.get("/api/drive/callback", async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    console.error("Google Drive Auth returned error:", error);
    return res.status(400).send(`
      <html>
        <head><title>Authentication Failed</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #f8fafc; color: #1e293b;">
          <div style="max-width: 450px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <h2 style="color: #ef4444; margin-bottom: 10px;">❌ Connection Failed</h2>
            <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 20px;">
              Authentication returned an error: ${error}
            </p>
            <button onclick="window.close()" style="background:#ef4444; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer;">Close Window</button>
          </div>
        </body>
      </html>
    `);
  }

  if (!code || !state) {
    return res.status(400).send("<h3>Invalid callback parameters.</h3>");
  }

  try {
    const { clientId, clientSecret, requesterId, redirectUri } = JSON.parse(state as string);
    
    const db = loadDB();
    const requester = db.users.find((u: any) => u.userId === requesterId);
    if (!requester) {
      return res.status(403).send("<h3>Authorization denied. Unauthorized user reference.</h3>");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      }).toString()
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      throw new Error(`Failed to exchange code for tokens. Status ${tokenResponse.status}: ${errBody}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token } = tokenData;

    if (!access_token) {
      throw new Error("No access token found in token exchange response.");
    }

    // Attempt to query user email for context
    let userEmail = "Connected Admin Account";
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        userEmail = userInfo.email || userEmail;
      }
    } catch (userErr) {
      console.error("Failed to query google user profile info:", userErr);
    }

    db.googleDriveConfig = {
      accessToken: access_token,
      refreshToken: refresh_token || (db.googleDriveConfig && db.googleDriveConfig.refreshToken), // Preserve refresh token if missing in re-auth
      clientId,
      clientSecret,
      user: { email: userEmail, displayName: "Persistent Google Account" },
      updatedAt: new Date().toISOString(),
      isPersistent: true
    };
    saveDB(db);

    res.send(`
      <html>
        <head><title>Connection Successful</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #f8fafc; color: #1e293b;">
          <div style="max-width: 450px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <h2 style="color: #10b981; margin-bottom: 15px;">✔ Connection Successful!</h2>
            <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 20px;">
              Google Drive has been persistently connected to your Templatesvilla platform under <strong>${userEmail}</strong>. 
              The server will automatically refresh authorization tokens <strong>completely for free</strong> in the background.
            </p>
            <p style="font-size: 12px; color: #94a3b8;">This window will close automatically in a moment.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_DRIVE_PERSIST_SUCCESS' }, '*');
              setTimeout(function() { window.close(); }, 2000);
            } else {
              document.body.innerHTML += '<a href="/" style="display:inline-block; margin-top:20px; text-decoration:none; color:#3b82f6; font-weight:bold;">Return to Home</a>';
            }
          </script>
        </body>
      </html>
    `);

  } catch (err: any) {
    console.error("OAuth callback error:", err);
    res.status(500).send(`
      <html>
        <head><title>Authentication Failed</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #f8fafc; color: #1e293b;">
          <div style="max-width: 450px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <h2 style="color: #ef4444; margin-bottom: 10px;">❌ Connection Failed</h2>
            <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 20px;">
              Failed to connect Google Drive: ${err.message || String(err)}
            </p>
            <button onclick="window.close()" style="background:#ef4444; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer;">Close Window</button>
          </div>
        </body>
      </html>
    `);
  }
});

app.post("/api/drive/config", (req, res) => {
  try {
    const { accessToken, user, requesterId } = req.body;
    const db = loadDB();
    
    // Auth Check
    const requester = db.users.find((u: any) => u.userId === requesterId);
    if (!requester) {
      return res.status(403).json({ success: false, message: "Unauthorized user reference." });
    }
    
    if (!accessToken) {
      return res.status(400).json({ success: false, message: "accessToken is required." });
    }
    
    db.googleDriveConfig = {
      accessToken,
      user: user || { email: "Connected Google Account" },
      updatedAt: new Date().toISOString()
    };
    saveDB(db);
    res.json({ success: true, config: db.googleDriveConfig });
  } catch (err) {
    console.error("Error saving drive config:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.delete("/api/drive/config", (req, res) => {
  try {
    const { requesterId } = req.body;
    const db = loadDB();
    
    // Auth Check
    const requester = db.users.find((u: any) => u.userId === requesterId);
    if (!requester) {
      return res.status(403).json({ success: false, message: "Unauthorized user reference." });
    }
    
    delete db.googleDriveConfig;
    saveDB(db);
    res.json({ success: true, message: "Google Drive disconnected successfully." });
  } catch (err) {
    console.error("Error disconnecting drive:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Change/Update Self Admin or User credentials
app.post("/api/auth/update", (req, res) => {
  const { currentUserId, targetUserId, newUserId, newPassword, newName, newRole, newPhone } = req.body;
  const db = loadDB();

  // Verify requester is admin or updating self
  const requester = db.users.find((u: any) => u.userId === currentUserId);
  if (!requester) {
    return res.status(403).json({ success: false, message: "Unauthorized action." });
  }

  const isSelf = currentUserId === targetUserId;
  const isAdmin = requester.role === "Admin";

  if (!isSelf && !isAdmin) {
    return res.status(433).json({ success: false, message: "You are not authorized to update this user." });
  }

  const targetIdx = db.users.findIndex((u: any) => u.userId === targetUserId);
  if (targetIdx === -1) {
    return res.status(404).json({ success: false, message: "Target user not found." });
  }

  // Check unique constraints for userID rename
  if (newUserId && newUserId !== targetUserId) {
    const exists = db.users.some(
      (u: any) => u.userId.toLowerCase() === newUserId.toLowerCase()
    );
    if (exists) {
      return res.status(400).json({ success: false, message: "Username already exists." });
    }
    db.users[targetIdx].userId = newUserId;

    // If users renamed their own account we need to update reference or relogin
  }

  if (newPassword) db.users[targetIdx].passwordHash = newPassword;
  if (newName) db.users[targetIdx].name = newName;
  if (newRole && isAdmin) db.users[targetIdx].role = newRole;
  if (newPhone !== undefined) db.users[targetIdx].phone = newPhone;

  saveDB(db);
  res.json({ success: true, message: "Credentials updated successfully.", users: db.users });
});

// Admin list creators
app.get("/api/users", (req, res) => {
  const db = loadDB();
  // Filter out password details if needed or send safely
  res.json({ success: true, users: db.users });
});

// Create creator user by Admin
app.post("/api/users/add", (req, res) => {
  const { requesterId, userId, password, name, role, phone } = req.body;
  const db = loadDB();

  const requester = db.users.find((u: any) => u.userId === requesterId);
  if (!requester || requester.role !== "Admin") {
    return res.status(403).json({ success: false, message: "Only Admins can add creators." });
  }

  const exists = db.users.some(
    (u: any) => u.userId.toLowerCase() === userId.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ success: false, message: "User ID already exists." });
  }

  const newUser = {
    userId,
    passwordHash: password || "creator123",
    role: role || "Member",
    name: name || userId,
    phone: phone || "",
  };

  db.users.push(newUser);
  saveDB(db);
  res.json({ success: true, message: "User added successfully.", users: db.users });
});

// Delete user by Admin
app.post("/api/users/delete", (req, res) => {
  const { requesterId, targetUserId } = req.body;
  const db = loadDB();

  const requester = db.users.find((u: any) => u.userId === requesterId);
  if (!requester || requester.role !== "Admin") {
    return res.status(403).json({ success: false, message: "Only Admins can delete users." });
  }

  if (targetUserId === "TemplatesvillaRDA") {
    return res.status(400).json({ success: false, message: "Cannot delete the default Admin account." });
  }

  db.users = db.users.filter((u: any) => u.userId !== targetUserId);
  saveDB(db);
  res.json({ success: true, message: "User deleted successfully.", users: db.users });
});

// Tasks CRUD
app.get("/api/tasks", (req, res) => {
  const db = loadDB();
  res.json({ success: true, tasks: db.tasks });
});

function generateUniqueTaskId(existingTasks: any[]): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  while (true) {
    let result = "TV-";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!existingTasks.some((t: any) => t.id === result)) {
      return result;
    }
  }
}

// Add Task
app.post("/api/tasks", (req, res) => {
  const db = loadDB();
  const newTaskId = generateUniqueTaskId(db.tasks);
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const autoOrderDate = `${day}/${month}/${year}`;

  const {
    clientName,
    clientPhone,
    category,
    videoName,
    scriptReady,
    price,
    advance,
    advReceivedDate,
    issuedToWhom,
    payableAmountToCreator,
    script,
    orderDate,
  } = req.body;

  const priceNum = Number(price) || 0;
  const advNum = Number(advance) || 0;
  const balNum = priceNum - advNum;

  // Auto generated Dates if appropriate
  const calculatedAdvDate = advNum > 0 ? (advReceivedDate || autoOrderDate) : "";

  const newTask = {
    id: newTaskId,
    orderDate: orderDate || autoOrderDate,
    deliveryDate: "",
    clientName: clientName || "New Client",
    clientPhone: clientPhone || "919999999999",
    category: category || "General",
    videoName: videoName || "Untitled Project",
    scriptReady: scriptReady || "No",
    price: priceNum,
    advance: advNum,
    advReceivedDate: calculatedAdvDate,
    balance: balNum,
    balanceReceived: "No",
    balRecDate: "",
    issuedToWhom: issuedToWhom || "Unassigned",
    orderStatus: "Pending",
    paidToCreator: "No",
    payableAmountToCreator: Number(payableAmountToCreator) || 0,
    paidToCreatorDate: "",
    script: script || "",
    sampleFiles: [],
    finalVideos: [],
    otherExpenses: []
  };

  db.tasks.push(newTask);
  saveDB(db);
  res.json({ success: true, task: newTask, tasks: db.tasks });
});

// Edit / Update Task (including deep and status changes)
app.put("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const idx = db.tasks.findIndex((t: any) => t.id === id);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }

  const currentTask = db.tasks[idx];
  const payload = req.body;

  // Capture original status
  const originalStatus = currentTask.orderStatus;
  const originalAdv = currentTask.advance;
  const originalBalRec = currentTask.balanceReceived;
  const originalPaidToCreator = currentTask.paidToCreator;

  // Merge fields
  const updatedTask = { ...currentTask, ...payload };

  // Strict automatically handles according to spec:
  // Delivery Date auto-set when status changes to completed
  if (payload.orderStatus === "Completed" && originalStatus !== "Completed") {
    if (!payload.deliveryDate) {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();
      updatedTask.deliveryDate = `${day}/${month}/${year}`;
    }
  } else if (payload.orderStatus !== undefined && payload.orderStatus !== "Completed") {
    updatedTask.deliveryDate = "";
  }

  // Advance Received Date created when advance enters/changes
  if (payload.advance !== undefined && Number(payload.advance) > 0 && originalAdv === 0) {
    if (!payload.advReceivedDate) {
      const now = new Date();
      updatedTask.advReceivedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    }
  }

  // Balance Received Date auto set on yes
  if (payload.balanceReceived === "Yes" && originalBalRec !== "Yes") {
    if (!payload.balRecDate) {
      const now = new Date();
      updatedTask.balRecDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    }
  } else if (payload.balanceReceived === "No") {
    updatedTask.balRecDate = "";
  }

  // Paid to Creator Date auto set on yes
  if (payload.paidToCreator === "Yes" && originalPaidToCreator !== "Yes") {
    if (!payload.paidToCreatorDate) {
      const now = new Date();
      updatedTask.paidToCreatorDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    }
  } else if (payload.paidToCreator === "No") {
    updatedTask.paidToCreatorDate = "";
  }

  // Recalculate balance
  updatedTask.balance = (Number(updatedTask.price) || 0) - (Number(updatedTask.advance) || 0);

  db.tasks[idx] = updatedTask;
  saveDB(db);
  res.json({ success: true, task: updatedTask, tasks: db.tasks });
});

// Bulk Import Tasks Endpoint for updates / migrations (supporting matching inserts and updates)
app.post("/api/tasks/import", (req, res) => {
  try {
    const db = loadDB();
    const { tasks: importedTasks } = req.body;
    if (!Array.isArray(importedTasks)) {
      return res.status(400).json({ success: false, message: "Invalid payload. 'tasks' must be an array." });
    }

    let updatedCount = 0;
    let createdCount = 0;

    importedTasks.forEach((t: any) => {
      let tid = t.id ? String(t.id).trim() : "";
      if (!tid) {
        tid = generateUniqueTaskId(db.tasks);
      }

      const existingIdx = db.tasks.findIndex((existing: any) => existing.id === tid);

      const priceNum = Number(t.price) || Number(t['Rate (Price)']) || 0;
      const advNum = Number(t.advance) || Number(t['Advance Paid']) || 0;
      const balNum = t.balance !== undefined ? Number(t.balance) : (priceNum - advNum);
      const creatorPayNum = Number(t.payableAmountToCreator) || Number(t['Creator Pay']) || 0;

      const sanitizedTask = {
        id: tid,
        orderDate: t.orderDate || t['Order Date'] || `${String(new Date().getDate()).padStart(2, "0")}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`,
        deliveryDate: t.deliveryDate || t['Delivery Date'] || "",
        clientName: t.clientName || t['Client Name'] || "Unknown Client",
        clientPhone: t.clientPhone || t['Client Phone'] || "919999999999",
        category: t.category || t['Category'] || "General",
        videoName: t.videoName || t['Video Topic'] || "Untitled Project",
        scriptReady: (t.scriptReady || t['Script Ready']) === "Yes" ? "Yes" : "No",
        price: priceNum,
        advance: advNum,
        advReceivedDate: t.advReceivedDate || t['Adv Received Date'] || (advNum > 0 ? (t.orderDate || t['Order Date'] || "") : ""),
        balance: balNum,
        balanceReceived: (t.balanceReceived || t['Cleared Status']) === "Yes" ? "Yes" : "No",
        balRecDate: t.balRecDate || t['Cleared Date'] || "",
        issuedToWhom: t.issuedToWhom || t['Assignee'] || "Unassigned",
        orderStatus: t.orderStatus || t['Status'] || "Pending",
        paidToCreator: (t.paidToCreator || t['Creator Paid Status']) === "Yes" ? "Yes" : "No",
        payableAmountToCreator: creatorPayNum,
        paidToCreatorDate: t.paidToCreatorDate || t['Creator Paid Date'] || "",
        script: t.script || t['Script'] || "",
        sampleFiles: Array.isArray(t.sampleFiles) ? t.sampleFiles : [],
        finalVideos: Array.isArray(t.finalVideos) ? t.finalVideos : [],
        otherExpenses: Array.isArray(t.otherExpenses) ? t.otherExpenses : []
      };

      if (existingIdx !== -1) {
        if (sanitizedTask.sampleFiles.length === 0 && db.tasks[existingIdx].sampleFiles?.length > 0) {
          sanitizedTask.sampleFiles = db.tasks[existingIdx].sampleFiles;
        }
        if (sanitizedTask.finalVideos.length === 0 && db.tasks[existingIdx].finalVideos?.length > 0) {
          sanitizedTask.finalVideos = db.tasks[existingIdx].finalVideos;
        }
        if (sanitizedTask.otherExpenses.length === 0 && db.tasks[existingIdx].otherExpenses?.length > 0) {
          sanitizedTask.otherExpenses = db.tasks[existingIdx].otherExpenses;
        }
        db.tasks[existingIdx] = sanitizedTask;
        updatedCount++;
      } else {
        db.tasks.push(sanitizedTask);
        createdCount++;
      }
    });

    saveDB(db);
    res.json({ success: true, createdCount, updatedCount, tasks: db.tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Clear All Tasks & Financial Data Endpoint (Permanent System Reset)
app.post("/api/tasks/clear-all", (req, res) => {
  try {
    const db = loadDB();
    db.tasks = [];
    db.expenses = [];
    db.notifications = [];
    saveDB(db);
    res.json({ 
      success: true, 
      message: "All tasks, expense ledgers, and notifications cleared successfully.", 
      tasks: [], 
      expenses: [] 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Delete Task Endpoint
app.delete("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const idx = db.tasks.findIndex((t: any) => t.id === id);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }

  db.tasks.splice(idx, 1);
  saveDB(db);
  res.json({ success: true, message: "Task deleted successfully", tasks: db.tasks });
});

// Update client name and phone across all tasks matching oldName
app.put("/api/clients/update", (req, res) => {
  const { oldName, newName, newPhone } = req.body;
  if (!oldName || !newName) {
    return res.status(400).json({ success: false, message: "oldName and newName are required" });
  }

  const db = loadDB();
  let updatedCount = 0;

  db.tasks = db.tasks.map((task: any) => {
    if (task.clientName === oldName) {
      updatedCount++;
      return {
        ...task,
        clientName: newName,
        clientPhone: newPhone !== undefined ? newPhone : task.clientPhone
      };
    }
    return task;
  });

  saveDB(db);
  res.json({ success: true, message: `Updated ${updatedCount} tasks for client ${oldName}`, tasks: db.tasks });
});

// Other Expenses CRUD endpoints
app.get("/api/expenses", (req, res) => {
  const db = loadDB();
  res.json({ success: true, expenses: db.expenses || [] });
});

app.post("/api/expenses", (req, res) => {
  const db = loadDB();
  const { description, amount, date } = req.body;
  if (!db.expenses) db.expenses = [];
  const nextId = "exp-" + (db.expenses.length + 1);
  const now = new Date();
  const formattedDate = date || `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  const newExpense = {
    id: nextId,
    description: description || "Other Operating Expense",
    amount: Number(amount) || 0,
    date: formattedDate
  };

  db.expenses.push(newExpense);
  saveDB(db);
  res.json({ success: true, expense: newExpense, expenses: db.expenses });
});

app.delete("/api/expenses/:id", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  if (db.expenses) {
    db.expenses = db.expenses.filter((e: any) => e.id !== id);
    saveDB(db);
  }
  res.json({ success: true, expenses: db.expenses || [] });
});

app.put("/api/expenses/:id", (req, res) => {
  const { id } = req.params;
  const { description, amount, date } = req.body;
  const db = loadDB();
  
  if (db.expenses) {
    const idx = db.expenses.findIndex((e: any) => e.id === id);
    if (idx !== -1) {
      db.expenses[idx] = {
        ...db.expenses[idx],
        description: description !== undefined ? description : db.expenses[idx].description,
        amount: amount !== undefined ? Number(amount) : db.expenses[idx].amount,
        date: date !== undefined ? date : db.expenses[idx].date
      };
      saveDB(db);
    }
  }
  res.json({ success: true, expenses: db.expenses || [] });
});

// Helper to add web push notifications when team members submit files/videos
function addPushNotification(db: any, options: {
  uploaderName: string;
  taskId: string;
  videoTopic: string;
  uploadType: "sample" | "final";
  fileNames: string[];
}) {
  if (!db.notifications) {
    db.notifications = [];
  }
  const newNotif = {
    id: "notif-" + Math.random().toString(36).substring(2, 11),
    uploaderName: options.uploaderName,
    taskId: options.taskId,
    videoTopic: options.videoTopic,
    uploadType: options.uploadType,
    fileNames: options.fileNames,
    createdAt: new Date().toISOString(),
    read: false
  };
  
  db.notifications.unshift(newNotif);
  
  // Cap at 150 notifications to prevent database bloating
  if (db.notifications.length > 150) {
    db.notifications = db.notifications.slice(0, 150);
  }
  return newNotif;
}

// Notifications API Endpoints
app.get("/api/admin/notifications", (req, res) => {
  try {
    const db = loadDB();
    res.json({ success: true, notifications: db.notifications || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.post("/api/admin/notifications/mark-read", (req, res) => {
  try {
    const { ids, all } = req.body;
    const db = loadDB();
    if (db.notifications) {
      db.notifications = db.notifications.map((n: any) => {
        if (all || (ids && ids.includes(n.id))) {
          return { ...n, read: true };
        }
        return n;
      });
      saveDB(db);
    }
    res.json({ success: true, notifications: db.notifications || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.post("/api/admin/notifications/clear", (req, res) => {
  try {
    const db = loadDB();
    db.notifications = [];
    saveDB(db);
    res.json({ success: true, notifications: [] });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Robust Chunked Upload API to support massive files of any size without proxy body limits
app.post("/api/upload/chunk", upload.single("chunk"), (req, res) => {
  const uploadId = req.body.uploadId;
  const chunkNumber = parseInt(req.body.chunkNumber || "1", 10);
  const totalChunks = parseInt(req.body.totalChunks || "1", 10);
  const fileName = req.body.fileName;
  const taskId = req.body.taskId;
  const type = req.body.type; // "sample" or "final"
  const uploadedBy = req.body.uploadedBy || "Admin";
  const clientName = req.body.clientName || "Unknown_Client";
  const uploaderName = req.body.uploaderName || "";

  if (!uploadId || !fileName || !taskId) {
    return res.status(400).json({ success: false, message: "Missing required chunk file session references." });
  }

  const tempDir = path.join(process.cwd(), "public", "uploads", "temp", uploadId);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const chunkPath = path.join(tempDir, `${chunkNumber}`);
  if (req.file && req.file.path) {
    fs.copyFileSync(req.file.path, chunkPath);
    fs.unlinkSync(req.file.path);
  } else {
    return res.status(400).json({ success: false, message: "No chunk file received." });
  }

  if (chunkNumber === totalChunks) {
    try {
      const isFinal = type === "final";
      const cleanClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, "_");
      
      const destDir = isFinal
        ? path.join(process.cwd(), "public", "uploads", "clients", cleanClientName)
        : path.join(process.cwd(), "public", "uploads", "sample_files");

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const mergedFileName = uniqueSuffix + "-" + fileName;
      const mergedFilePath = path.join(destDir, mergedFileName);

      fs.writeFileSync(mergedFilePath, "");

      for (let i = 1; i <= totalChunks; i++) {
        const partPath = path.join(tempDir, `${i}`);
        if (!fs.existsSync(partPath)) {
          throw new Error(`Chunk component part ${i} missing from stream sequence.`);
        }
        const chunkData = fs.readFileSync(partPath);
        fs.appendFileSync(mergedFilePath, chunkData);
        fs.unlinkSync(partPath);
      }

      try {
        fs.rmdirSync(tempDir);
      } catch (e) {
        console.warn("Could not remove temp directory:", tempDir, e);
      }

      const db = loadDB();
      const taskIdx = db.tasks.findIndex((t: any) => t.id === taskId);
      if (taskIdx === -1) {
        return res.status(404).json({ success: false, message: "Task reference not found during merge." });
      }

      const fileId = Math.random().toString(36).substring(2, 15);
      const cleanPath = isFinal
        ? `/uploads/clients/${cleanClientName}/${mergedFileName}`
        : `/uploads/sample_files/${mergedFileName}`;
      const mockDriveUrl = isFinal
        ? `https://drive.google.com/open?id=client_${cleanClientName}_${fileId}`
        : `https://drive.google.com/open?id=sample_folder_${fileId}`;

      const newRecord = {
        id: fileId,
        name: fileName,
        size: fs.statSync(mergedFilePath).size,
        uploadedAt: new Date().toISOString(),
        path: cleanPath,
        driveUrl: mockDriveUrl,
        uploadedBy: isFinal ? undefined : (uploadedBy as 'Admin' | 'User'),
      };

      if (isFinal) {
        if (!db.tasks[taskIdx].finalVideos) {
          db.tasks[taskIdx].finalVideos = [];
        }
        db.tasks[taskIdx].finalVideos.push(newRecord);
        
        addPushNotification(db, {
          uploaderName: uploaderName || "Team Member",
          taskId,
          videoTopic: db.tasks[taskIdx].videoName || "Untitled Topic",
          uploadType: "final",
          fileNames: [fileName]
        });
      } else {
        if (!db.tasks[taskIdx].sampleFiles) {
          db.tasks[taskIdx].sampleFiles = [];
        }
        db.tasks[taskIdx].sampleFiles.push(newRecord);

        if (uploadedBy === "User") {
          addPushNotification(db, {
            uploaderName: uploaderName || "Team Member",
            taskId,
            videoTopic: db.tasks[taskIdx].videoName || "Untitled Topic",
            uploadType: "sample",
            fileNames: [fileName]
          });
        }
      }

      saveDB(db);

      return res.json({
        success: true,
        message: "File uploaded and merged successfully in chunks!",
        task: db.tasks[taskIdx],
      });
    } catch (mergeErr: any) {
      console.error("Failed to merge uploaded chunk sequence:", mergeErr);
      return res.status(500).json({ success: false, message: `Merge failure: ${mergeErr.message}` });
    }
  }

  return res.json({ success: true, chunkReceived: chunkNumber });
});

// Handle Multiple file uploads via sample and final APIs
// Multer middleware handles storing it properly inside the specified directory
app.post("/api/upload/sample", upload.array("files"), (req, res) => {
  const taskId = req.query.taskId as string;
  const uploadedBy = (req.query.uploadedBy as string) || "Admin"; // "Admin" or "User"

  if (!taskId) {
    return res.status(400).json({ success: false, message: "Missing taskId reference." });
  }

  const db = loadDB();
  const taskIdx = db.tasks.findIndex((t: any) => t.id === taskId);
  if (taskIdx === -1) {
    return res.status(404).json({ success: false, message: "Task not found." });
  }

  let driveUrls: Record<string, string> = {};
  if (req.body.driveUrls) {
    try {
      driveUrls = JSON.parse(req.body.driveUrls);
    } catch (e) {
      console.error("Failed to parse driveUrls body map in sample upload", e);
    }
  }

  let uploadedRecords: any[] = [];
  let fileNames: string[] = [];

  if (req.body.metadataFiles) {
    // If files are already uploaded directly to Google Drive via Client-Side Integration,
    // we only receive meta info to preserve server bandwidth and bypass HTTP transfer limits
    const metaList = Array.isArray(req.body.metadataFiles) ? req.body.metadataFiles : [];
    uploadedRecords = metaList.map((file: any) => {
      const fileId = Math.random().toString(36).substring(2, 15);
      return {
        id: fileId,
        name: file.name,
        size: Number(file.size) || 0,
        uploadedAt: new Date().toISOString(),
        path: "",
        driveUrl: file.driveUrl,
        uploadedBy: uploadedBy as 'Admin' | 'User',
      };
    });
    fileNames = metaList.map((file: any) => file.name);
  } else {
    const uploadFiles = (req.files as Express.Multer.File[]) || [];
    uploadedRecords = uploadFiles.map((file) => {
      // Generate a beautiful simulated google drive link
      const fileId = Math.random().toString(36).substring(2, 15);
      const mockDriveUrl = `https://drive.google.com/open?id=sample_folder_${fileId}`;
      const cleanPath = `/uploads/sample_files/${file.filename}`;
      const realDriveUrl = driveUrls[file.originalname] || mockDriveUrl;

      return {
        id: fileId,
        name: file.originalname,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        path: cleanPath,
        driveUrl: realDriveUrl,
        uploadedBy: uploadedBy as 'Admin' | 'User',
      };
    });
    fileNames = uploadFiles.map(f => f.originalname);
  }

  if (!db.tasks[taskIdx].sampleFiles) {
    db.tasks[taskIdx].sampleFiles = [];
  }

  db.tasks[taskIdx].sampleFiles.push(...uploadedRecords);

  // Trigger push notification if uploaded by standard team member (User)
  if (uploadedBy === "User") {
    const uploaderName = (req.query.uploaderName as string) || "Team Member";
    addPushNotification(db, {
      uploaderName,
      taskId,
      videoTopic: db.tasks[taskIdx].videoName || "Untitled Topic",
      uploadType: "sample",
      fileNames: fileNames
    });
  }

  saveDB(db);

  res.json({ success: true, sampleFiles: db.tasks[taskIdx].sampleFiles, task: db.tasks[taskIdx] });
});

app.post("/api/upload/final", upload.array("files"), (req, res) => {
  const taskId = req.query.taskId as string;
  const clientName = (req.query.clientName as string) || "Unknown_Client";
  const cleanClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (!taskId) {
    return res.status(400).json({ success: false, message: "Missing taskId reference." });
  }

  const db = loadDB();
  const taskIdx = db.tasks.findIndex((t: any) => t.id === taskId);
  if (taskIdx === -1) {
    return res.status(404).json({ success: false, message: "Task not found." });
  }

  let driveUrls: Record<string, string> = {};
  if (req.body.driveUrls) {
    try {
      driveUrls = JSON.parse(req.body.driveUrls);
    } catch (e) {
      console.error("Failed to parse driveUrls body map in final upload", e);
    }
  }

  let uploadedRecords: any[] = [];
  let fileNames: string[] = [];

  if (req.body.metadataFiles) {
    const metaList = Array.isArray(req.body.metadataFiles) ? req.body.metadataFiles : [];
    uploadedRecords = metaList.map((file: any) => {
      const fileId = Math.random().toString(36).substring(2, 15);
      return {
        id: fileId,
        name: file.name,
        size: Number(file.size) || 0,
        uploadedAt: new Date().toISOString(),
        path: "",
        driveUrl: file.driveUrl,
      };
    });
    fileNames = metaList.map((file: any) => file.name);
  } else {
    const uploadFiles = (req.files as Express.Multer.File[]) || [];
    uploadedRecords = uploadFiles.map((file) => {
      const fileId = Math.random().toString(36).substring(2, 15);
      // Dynamic naming mapping based on client
      const mockDriveUrl = `https://drive.google.com/open?id=client_${cleanClientName}_${fileId}`;
      const cleanPath = `/uploads/clients/${cleanClientName}/${file.filename}`;
      const realDriveUrl = driveUrls[file.originalname] || mockDriveUrl;

      return {
        id: fileId,
        name: file.originalname,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        path: cleanPath,
        driveUrl: realDriveUrl,
      };
    });
    fileNames = uploadFiles.map(f => f.originalname);
  }

  if (!db.tasks[taskIdx].finalVideos) {
    db.tasks[taskIdx].finalVideos = [];
  }

  db.tasks[taskIdx].finalVideos.push(...uploadedRecords);

  // Trigger push notification on final video delivery
  const uploaderName = (req.query.uploaderName as string) || "Team Member";
  addPushNotification(db, {
    uploaderName,
    taskId,
    videoTopic: db.tasks[taskIdx].videoName || "Untitled Topic",
    uploadType: "final",
    fileNames: fileNames
  });

  saveDB(db);

  res.json({ success: true, finalVideos: db.tasks[taskIdx].finalVideos, task: db.tasks[taskIdx] });
});

// Serving the static files after route declaration so file viewing works instantly in container
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

async function startServer() {
  // Sync database from Firestore before booting Express listeners to avoid database wipeouts
  await syncDatabaseFromFirestore();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
