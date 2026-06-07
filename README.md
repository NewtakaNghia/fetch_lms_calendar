# Moodle ICS Proxy Server

Một **stateless proxy server** Node.js (Express.js) giúp transform Moodle calendar ICS file bằng cách thêm tên môn học vào các deadline/event.

## 📋 Mô tả

Ứng dụng này hoạt động như một proxy giữa Moodle và Google Calendar:

1. **Google Calendar** gọi đến endpoint `/calendar.ics` của server
2. Server fetch file `.ics` gốc từ Moodle
3. Server parse và transform mỗi event:
   - Trích xuất tên môn học từ trường `DESCRIPTION`
   - Thêm tên môn học vào đầu trường `SUMMARY`
4. Return file `.ics` đã transformed

**Ví dụ transformation:**
- Input: `SUMMARY:Bài tập Buổi 1`
  `DESCRIPTION:Cấu trúc dữ liệu và giải thuật [DSAA001]`
- Output: `SUMMARY:[DSAA001] Cấu trúc dữ liệu - Bài tập Buổi 1`

## 🚀 Cài đặt

### 1. Clone hoặc tạo dự án
```bash
cd Deadline_Lms
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình biến môi trường
```bash
cp .env.example .env
```

**Biến cần cấu hình:**
- `MOODLE_CALENDAR_URL`: URL export lịch từ Moodle (lấy từ Moodle → Calendar → Settings → Export calendar)
  - Ví dụ: `https://lms.hcmut.edu.vn/calendar/export.php?userid=123&token=abc123`
- `PORT`: Port server chạy (mặc định: 3000)
- `NODE_ENV`: Environment (development/production)

## 📁 Cấu trúc dự án

```
src/
├── utils/
│   └── ics-parser.ts       # Logic parse & transform ICS file
└── index.ts                # Express server & endpoints
```

## 📝 Scripts

```bash
# Chạy development (ts-node - tự động recompile)
npm run dev

# Build TypeScript
npm run build

# Chạy production (compiled code)
npm start

# Watch mode (recompile on change)
npm run watch

# Xóa dist folder
npm run clean
```

## 🔄 Luồng hoạt động (Data Flow)

```
┌──────────────┐
│ Google       │
│ Calendar     │
└──────┬───────┘
       │ GET /calendar.ics
       │
       ▼
┌──────────────────────────┐
│ Moodle ICS Proxy Server  │
│  - Fetch Moodle ICS      │
│  - Parse events          │
│  - Extract course names  │
│  - Prepend to SUMMARY    │
│  - Return transformed    │
└──────┬───────────────────┘
       │
       ▼
┌──────────────┐
│ Moodle       │
│ Calendar     │
│ Export API   │
└──────────────┘
```

## 📡 API Endpoints

### GET /calendar.ics
Fetch transformed Moodle calendar

**Response:**
- Content-Type: `text/calendar; charset=utf-8`
- Body: Valid iCalendar format (.ics)

**Status Codes:**
- `200`: Success
- `500`: Error fetching/transforming calendar

**Example:**
```bash
curl http://localhost:3000/calendar.ics > calendar.ics
```

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-06-07T10:30:00.000Z"
}
```

## 🛠️ Cách sử dụng với Google Calendar

1. **Lấy Moodle calendar export URL:**
   - Đăng nhập Moodle → Calendar → Settings
   - Tìm "Calendar export" section
   - Copy URL (chứa userid & token)

2. **Setup server:**
   - Cài đặt và chạy proxy server (ở cloud hoặc local)
   - Đảm bảo server accessible từ bên ngoài (nếu dùng cloud)
   - Cấu hình biến `MOODLE_CALENDAR_URL`

3. **Add vào Google Calendar:**
   - Đi tới Google Calendar Settings
   - Tab "Add calendar" → "Subscribe to calendar"
   - Nhập URL của proxy server: `https://your-domain.com/calendar.ics`
   - Sync frequency sẽ được Google Calendar tự quản lý (thường vài giờ)

## 🔧 Transform Logic

File [src/utils/ics-parser.ts](src/utils/ics-parser.ts) chứa logic chính:

```typescript
// Extract course name patterns:
1. [Course Name] - Bracketed text
2. Course Name - or Course Name: - Text before dash/colon
3. First line of description - Default fallback
```

## 🌍 Deployment

### Heroku
```bash
git push heroku main
```
(Cần setup Heroku account & config variables)

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["npm", "start"]
```

### PM2 (VPS)
```bash
pm2 start dist/index.js --name moodle-proxy
pm2 save
pm2 startup
```

## 🐛 Troubleshooting

### Lỗi: "Failed to fetch Moodle calendar"
- Kiểm tra `MOODLE_CALENDAR_URL` hợp lệ
- Kiểm tra URL không hết hạn (token hết hạn)
- Kiểm tra network connectivity

### Lỗi: "Cannot parse ICS"
- Xác nhận Moodle trả về file `.ics` hợp lệ
- Check log để xem content tính trước

### Events không hiển thị đúng
- Google Calendar cache ~24h, thử xóa và thêm lại calendar
- Kiểm tra parser logic trong `ics-parser.ts`

## 🚀 Performance

- **Stateless**: Không lưu trữ state, có thể scale horizontally
- **Lightweight**: Chỉ cần Express & axios, không cần database
- **Fast**: Xử lý ICS qua regex, không parse XML phức tạp
- **Memory efficient**: Stream response, không buffer toàn bộ

## 📄 License

MIT

## 👨‍💻 Contributors

Tạo bởi: [Your Name]
