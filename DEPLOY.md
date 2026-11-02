# Deploy miễn phí: Vercel (giao diện) + Render (API) + MongoDB Atlas (dữ liệu)

```
Người dùng ──► Vercel (Next.js, thư mục frontend)
                  │  gọi API
                  ▼
               Render (Express, thư mục backend) ──► MongoDB Atlas (hồ sơ + tệp đính kèm)
                  ▲
cron-job.org ─────┘  10 phút / lần: giữ Render không "ngủ" + gửi nhắc hạn đúng giờ
```

Tất cả đều dùng gói miễn phí. Giới hạn cần biết:
- **Render free**: không có request trong 15 phút thì server "ngủ", lần mở sau chờ khoảng 30–60 giây.
  Bước 5 (cron-job.org) giữ server luôn thức; 750 giờ free/tháng chỉ đủ cho **một** service chạy 24/7.
- **Atlas M0**: 512 MB cho cả hồ sơ lẫn tệp đính kèm (PDF / ảnh scan). Nên scan ở độ phân giải vừa phải.
- **Vercel Hobby**: dành cho mục đích cá nhân, phi thương mại.

Làm theo đúng thứ tự dưới đây: Render trước (để có địa chỉ API), rồi Vercel, rồi quay lại Render điền địa chỉ web.

---

## Bước 1 — MongoDB Atlas: cho phép Render kết nối

1. Vào https://cloud.mongodb.com → project của bạn → **Network Access** → **Add IP Address**.
2. Chọn **Allow access from anywhere** (`0.0.0.0/0`) → Confirm.
   (IP của Render thay đổi nên không whitelist từng IP được; bảo vệ dựa vào mật khẩu database — đừng chia sẻ chuỗi kết nối.)
3. Chuỗi kết nối chính là `MONGO_URI` trong `backend/.env` trên máy bạn — dùng lại ở bước 2.

## Bước 2 — Render: deploy API

1. Đăng ký https://render.com bằng tài khoản GitHub.
2. **New +** → **Blueprint** → chọn repo `QuanLyHoSo` → Render đọc file `render.yaml` ở thư mục gốc.
3. Render hỏi các biến bí mật — điền:

   | Biến | Giá trị |
   |---|---|
   | `MONGO_URI` | copy từ `backend/.env` |
   | `CORS_ORIGINS` | tạm điền `https://example.com` (sửa ở bước 4) |
   | `APP_URL` | tạm điền `https://example.com` (sửa ở bước 4) |
   | `SMTP_USER` | Gmail dùng để gửi thư (như trong `backend/.env`) |
   | `SMTP_PASS` | App Password 16 ký tự (như trong `backend/.env`) |

   `JWT_SECRET` và `CRON_SECRET` Render tự sinh — không cần điền.
4. **Apply** → chờ build xong (2–4 phút). Địa chỉ API có dạng `https://quanlyhoso-api.onrender.com`
   (xem ở đầu trang service; tên có thể có thêm vài ký tự nếu trùng).
5. Kiểm tra: mở `https://<địa-chỉ-render>/api/health` → thấy `{"status":"ok","db":"connected"}` là được.
   Nếu `db` là `disconnected` hoặc lỗi: xem tab **Logs**, thường do bước 1 hoặc sai `MONGO_URI`.

## Bước 3 — Vercel: deploy giao diện

1. Đăng ký https://vercel.com bằng tài khoản GitHub.
2. **Add New…** → **Project** → **Import** repo `QuanLyHoSo`.
3. **Root Directory**: bấm **Edit** → chọn `frontend`. Framework tự nhận là Next.js.
4. **Environment Variables** → thêm:
   - `NEXT_PUBLIC_API_URL` = `https://<địa-chỉ-render>/api` (có `/api`, không có `/` ở cuối)
5. **Deploy** → chờ xong. Địa chỉ web có dạng `https://quanlyhoso.vercel.app` (xem ở **Domains**).

> `NEXT_PUBLIC_API_URL` được đóng vào lúc build: đổi giá trị thì vào **Deployments → ⋯ → Redeploy**.

## Bước 4 — Render: điền địa chỉ web

Render → service `quanlyhoso-api` → **Environment** → sửa:
- `CORS_ORIGINS` = `https://quanlyhoso.vercel.app` (địa chỉ web ở bước 3, không có `/` ở cuối)
- `APP_URL` = cùng địa chỉ đó (dùng cho nút trong email, link quên mật khẩu)

**Save Changes** → Render tự deploy lại. Sau đó mở trang web → đăng nhập được là xong phần chính.

## Bước 5 — cron-job.org: giữ server thức + nhắc hạn email

1. Render → **Environment** → copy giá trị `CRON_SECRET`.
2. Đăng ký https://cron-job.org → **Create cronjob**:
   - URL: `https://<địa-chỉ-render>/api/cron/reminders`
   - Schedule: **Every 10 minutes**
   - Tab **Advanced** → **Headers** → thêm `Authorization` = `Bearer <CRON_SECRET>`
3. Save → **Test run**: kết quả `200` với nội dung kiểu `{"data":{"skipped":"DISABLED"}}` là đúng
   (nhắc hạn chưa bật). Bật nhắc hạn trong web: **Quản trị → Nhắc hạn email**, chọn giờ gửi —
   lần gọi đầu tiên sau giờ đó mỗi ngày sẽ gửi thư (tối đa 1 lần/ngày).

## Bước 6 — Việc nên làm ngay sau khi lên mạng

- **Đổi mật khẩu `admin`** (đang là `123456`): đăng nhập → **Đổi mật khẩu**. Trang web giờ ai cũng truy cập được.
- Kiểm tra thử: tạo một tài khoản có email của bạn → nhận email chào mừng; thử **Quên mật khẩu**.
- **Không** chạy `npm run seed` với `MONGO_URI` của Atlas (seed xoá dữ liệu; script đã chặn khi có dữ liệu thật).

## Cập nhật sau này

Sửa code trên máy → `git push` → Vercel và Render tự build và deploy lại (mỗi bên 2–4 phút).

## Gặp lỗi thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Web báo "Không kết nối được tới API" | Sai `NEXT_PUBLIC_API_URL` (thiếu `/api`?) hoặc Render đang ngủ / build lỗi — xem Logs |
| Lỗi CORS trong Console trình duyệt | `CORS_ORIGINS` trên Render chưa đúng địa chỉ Vercel (thừa `/` cuối, sai `https`) |
| Đăng nhập xong bị đá ra liên tục | Đổi `JWT_SECRET` làm token cũ mất hiệu lực — đăng nhập lại |
| Email không gửi | `SMTP_USER` / `SMTP_PASS` sai hoặc Gmail chưa bật Xác minh 2 bước |
| Mở web chờ lâu buổi sáng | Chưa làm bước 5, Render vừa thức dậy |
