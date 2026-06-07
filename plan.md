# Moodle ICS Proxy Server - Project Plan

## 1. Phân tích yêu cầu & Luồng hoạt động (Architecture)

Chuyển đổi hệ thống thành một **Stateless Proxy Server**.

**Luồng dữ liệu (Data Flow):**
1. Google Calendar gọi đến endpoint của proxy server (Ví dụ: `GET https://your-domain.com/calendar.ics`).
2. Server nhận request, lập tức gọi `GET` tới URL gốc của lms.hcmut.edu.vn để lấy file `.ics` chuẩn.
3. Server parse nội dung `.ics` vừa lấy được.
4. Quét qua từng event: Trích xuất tên môn học (thường nằm ở dòng đầu hoặc có pattern cụ thể trong trường `DESCRIPTION`), sau đó nối vào đầu của trường `SUMMARY` (Tên event).
5. Đóng gói lại thành format `.ics` hợp lệ và trả về (Response) cho Google Calendar.

## 2. Công nghệ (Tech Stack)

Vì đây là một API đơn giản, không cần database, ta ưu tiên sự nhẹ nhàng:
* **Framework:** Node.js với Express.js (xử lý routing nhanh gọn).
* **HTTP Client:** `axios` (hoặc dùng `fetch` native của Node.js 18+).
* **iCal Processing:** * Cách 1 (Khuyên dùng): `node-ical` để parse và `ical-generator` để build lại chuỗi `.ics`.
  * Cách 2 (Tối ưu tốc độ): Thao tác chuỗi trực tiếp (String/Regex) để tìm và thay thế (Find & Replace) trên raw text, vì cấu trúc iCal khá tuyến tính.

## 3. Cấu trúc Source Code (Directory Structure)

```text
moodle-ics-proxy/
├── src/
│   ├── utils/
│   │   └── ics-parser.ts       # Chứa logic Regex/Parsing để bóc tách và merge chuỗi
│   └── index.ts                # Khởi tạo Express server & định nghĩa Endpoint
├── package.json
└── tsconfig.json