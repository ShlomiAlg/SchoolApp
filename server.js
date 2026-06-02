const express = require('express');
const xlsx = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: "*" }
});
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});
const http = require('http');
const server = http.createServer(app);
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));


// =====================
// FIX: PORT (Render support)
// =====================
const PORT = process.env.PORT || 3000;

// =====================
// USERS
// =====================
const USERS = {
  alon: { username: 'admin', pass: 'admin123', name: 'מנהל ראשי', schoolName: 'בית ספר אלון' },
  carmel: { username: 'teacher1', pass: 'pass1', name: 'שרה לוי', schoolName: 'בית ספר כרמל' },
  hasharon: { username: 'manager', pass: 'school2024', name: 'דוד כהן', schoolName: 'בית ספר השרון' }
};

// =====================
// FILE PATHS
// =====================
const STUDENTS_FILE = path.join(__dirname, 'students.xlsx');
const BUSES_FILE = path.join(__dirname, 'buses.xlsx');

// =====================
// 🔥 NEW: ATTENDANCE STORAGE (SYNC BETWEEN DEVICES)
// =====================
const ATT_FILE = path.join(__dirname, 'attendance.json');

function loadAttendance() {
  try {
    if (!fs.existsSync(ATT_FILE)) return {};
    return JSON.parse(fs.readFileSync(ATT_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveAttendance(data) {
  fs.writeFileSync(ATT_FILE, JSON.stringify(data, null, 2));
}

// =====================
// SAFE EXCEL LOADER
// =====================
function loadExcel(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.SheetNames[0];
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheet], {
    defval: "",
    raw: false
  });
}

// =====================
// STUDENTS
// =====================
function getStudentsFromExcel() {
  try {
    const data = loadExcel(STUDENTS_FILE);
    const attendance = loadAttendance();

    const colors = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6'];

    return data.map((row, i) => {
      const id = row['מזהה'] || i + 1;

      return {
        id,
        name: `${row['שם פרטי']} ${row['שם משפחה']}`.trim(),
        class: row['כיתה'] || '',
        phone: row['מספר טלפון'] || '',
        tz: row['תעודת זהות'] || '',
        color: colors[i % colors.length],
        status: attendance[id] || 'v'
      };
    });

  } catch (err) {
    console.error("STUDENTS ERROR:", err);
    return [];
  }
}

// =====================
// BUSES
// =====================
function getBusesFromExcel() {
  try {
    const data = loadExcel(BUSES_FILE);

    const buses = {};

    data.forEach(row => {
      const values = Object.values(row);

      const from = (values[0] || '').toString().trim();
      const to = (values[1] || '').toString().trim();

      if (!from || !to) return;

      const busName = `${from} → ${to}`;

      if (!buses[busName]) {
        buses[busName] = {
          name: busName,
          from,
          to,
          students: []
        };
      }

      buses[busName].students.push({
        id: values[2],
        tz: values[3],
        name: `${values[4]} ${values[5]}`,
        class: values[6]
      });
    });

    return Object.values(buses);

  } catch (err) {
    console.error("BUSES ERROR:", err);
    return [];
  }
}

// =====================
// LOGIN
// =====================
app.post('/api/login', (req, res) => {
  const { username, password, school } = req.body;
  const user = USERS[school];

  if (user && user.username === username && user.pass === password) {
    return res.json({
      success: true,
      name: user.name,
      schoolName: user.schoolName
    });
  }

  return res.status(401).json({ success: false });
});

// =====================
// STUDENTS API
// =====================
app.get('/api/students', (req, res) => {
  res.json(getStudentsFromExcel());
});

// =====================
// BUSES API
// =====================
app.get('/api/buses', (req, res) => {
  res.json(getBusesFromExcel());
});

// =====================
// 🔥 NEW: UPDATE ATTENDANCE (SYNC ALL DEVICES)
// =====================
app.post('/api/attendance', (req, res) => {
  const { studentId, status } = req.body;

  const data = loadAttendance();
  data[String(studentId)] = status;
  saveAttendance(data);

  // 🔥 שידור לכל המשתמשים בזמן אמת
  io.emit('attendance-updated', {
    studentId,
    status
  });

  res.json({ success: true });
});

// =====================
// REPORTS
// =====================
app.get('/api/reports', (req, res) => {
  const students = getStudentsFromExcel();

  const total = students.length;

  const byClass = {};
  students.forEach(s => {
    if (!byClass[s.class]) byClass[s.class] = 0;
    byClass[s.class]++;
  });

  res.json({
    totalStudents: total,
    classes: byClass
  });
});

// =====================
// START SERVER
// =====================
server.listen(PORT, () => {
  console.log("Server running 🚀 on port " + PORT);
});