# Hệ thống Quản lý & Theo dõi Hồ sơ

| Phần      | Công nghệ                                                          | Port |
|-----------|--------------------------------------------------------------------|------|
| backend/  | Express 5, Mongoose 9, date-fns, JWT (jsonwebtoken), bcryptjs      | 8081 |
| frontend/ | Next.js 15 (App Router), Tailwind 3, TanStack Table 8, Lucide       | 8080 |

## Chạy (Windows PowerShell)

Cần MongoDB (local hoặc Atlas). Sao chép `backend/.env.example` thành `backend/.env` rồi điền `MONGO_URI` và `JWT_SECRET`.

Chạy hằng ngày (KHÔNG có `npm run seed`):

```powershell
cd backend; npm run dev
```
```powershell
cd frontend; npm run dev
```

Chỉ lần đầu cài trên máy mới: `npm install` ở cả hai thư mục. `npm run seed` chỉ dùng cho database **trống / demo** — nó xoá
sạch hồ sơ và tài khoản, nên tự chặn nếu database đã có dữ liệu thật (muốn ép: `npm run seed -- --force`).

Mở http://localhost:8080 → chuyển tới `/login`. Port 8080 không được bị chiếm (ví dụ Apache của Laragon).

## Đăng nhập

Tài khoản do `npm run seed` tạo, mật khẩu chung là `SEED_PASSWORD` (mặc định `123456`):

| Username | Họ tên           | Role    |
|----------|------------------|---------|
| admin    | Lãnh đạo / Admin | ADMIN   |
| canbo_a  | Nguyễn Văn A     | CAN_BO  |
| canbo_b  | Trần Thị B       | CAN_BO  |
| vanthu   | Văn thư          | VAN_THU |

- `POST /api/auth/login` trả JWT (hạn `JWT_EXPIRES_IN`, mặc định 8h). Mật khẩu lưu dạng bcrypt hash.
- Mọi API khác cần header `Authorization: Bearer <token>`. Role luôn lấy lại từ DB, không tin role trong token.
- FE lưu phiên ở `localStorage` (`qlhs.session`); API trả 401 thì tự đăng xuất và về `/login?expired=1`.
- Thiếu `JWT_SECRET` thì backend dùng khoá tạm ngẫu nhiên — token mất hiệu lực mỗi lần restart.
- **Sai mật khẩu**: 5 lần / 15 phút cho một tài khoản (hoặc 20 lần cho một IP) → tạm khoá 15 phút (`backend/rateLimit.js`,
  đếm trong bộ nhớ, khởi động lại backend là xoá).
- **Đổi mật khẩu** (`/account`, nút "Đổi mật khẩu" trên thanh trên cùng). Tài khoản do Admin tạo / đặt lại mật khẩu
  phải tự đổi ở lần đăng nhập kế tiếp. Đổi mật khẩu đăng xuất mọi phiên khác.
- **Quên mật khẩu** (trang đăng nhập): nhập tên đăng nhập hoặc email → gửi link `/reset-password` (hết hạn sau 30 phút,
  dùng 1 lần) tới email của tài khoản. Cần SMTP và `APP_URL` đúng địa chỉ web; tài khoản không có email thì nhờ Admin đặt lại.

## Loại thủ tục & hạn xử lý

17 loại thủ tục thật (Cấp phép xây dựng, Cấp GCN, Xác nhận tình trạng nhà, Kê khai thuế…) — danh mục ở `backend/catalog.js`.
Hạn xử lý của một hồ sơ = **Gia hạn** → **Ngày hẹn trả (biên nhận)** → **Ngày vào + số ngày của loại**.

**Quản trị → Cấu hình hạn** (lưu trong collection `settings`, xem `backend/settings.js`):
- Số ngày trình LĐ / hạn xử lý cho từng loại.
- Tính theo **ngày làm việc** (mặc định bật): bỏ ngày nghỉ trong tuần (mặc định T7, CN) và ngày lễ.
  Ngày lễ dương lịch cố định có sẵn; **Tết Nguyên đán, Giỗ Tổ, ngày nghỉ bù phải tự thêm** mỗi năm.
- Cấu hình áp dụng cho hồ sơ tiếp nhận / sửa sau khi lưu; nút **Tính lại hạn** áp dụng cho hồ sơ chưa hoàn thành.

## Thao tác & theo dõi

- **Chọn nhiều hồ sơ** (ô chọn ở cột Mã HS) → Hoàn thành / Đổi trạng thái / Phân công / Xuất Excel / Xoá (Admin).
- **Xuất Excel** danh sách đang lọc (chân bảng) — cán bộ không có cột nhạy cảm.
- **Lịch sử xử lý** trong cửa sổ chi tiết hồ sơ: ai sửa gì, lúc nào (collection `dossierlogs`, `backend/audit.js`).
- **Chuyển cán bộ / Gia hạn** bắt buộc nhập lý do (sửa trên bảng, trong form, phân công hàng loạt, hoặc nút 📅 Gia hạn ở
  cột Thao tác). Lý do ghi vào Lịch sử xử lý. Phân công lần đầu (hồ sơ chưa có cán bộ) không cần lý do.
- **Tệp đính kèm** trong cửa sổ chi tiết: PDF, JPG/PNG, Word, Excel, tối đa 20 MB/tệp, 30 tệp/hồ sơ. Tệp lưu ở
  `backend/uploads` (đổi bằng `UPLOAD_DIR`) — **nhớ sao lưu thư mục này cùng database**. Cán bộ gỡ được tệp mình tải lên;
  Admin / Văn thư gỡ được mọi tệp. Xoá hồ sơ thì xoá luôn tệp.
- **Tra cứu nhanh** (ô cạnh nút Nhập hồ sơ): gõ đúng số biên nhận hoặc mã hồ sơ → mở ngay chi tiết.
- **In phiếu theo dõi** (nút 🖨 ở cột Thao tác hoặc trong chi tiết): phiếu A4 gồm thông tin, quá trình xử lý, chỗ ký.
- Danh sách **lọc, tìm kiếm, sắp xếp, phân trang ở server** — chỉ tải từng trang; "Chọn tất cả hồ sơ đang lọc" tối đa 3.000.
- **Báo cáo** (`/reports`): theo kỳ — tiếp nhận, giải quyết đúng/trễ hạn, tồn; biểu đồ theo tháng, tỷ lệ đúng hạn theo cán bộ;
  xuất báo cáo Excel (`backend/reports.js`). Hoàn thành không ghi ngày kết thúc được đếm riêng.
- **Nhắc hạn email** (Quản trị → Nhắc hạn email, `backend/reminders.js`): mỗi ngày đúng giờ cấu hình gửi cho cán bộ có email
  danh sách hồ sơ quá hạn / sắp đến hạn, và bản tổng hợp cho Admin có email. Cần SMTP trong `.env`; mặc định tắt.

## Nhập sổ Excel

**Trên web (Admin, Văn thư):** nút **Nhập từ Excel** ở trang chính → chọn/kéo thả file .xlsx → xem trước
(hồ sơ mới, hồ sơ đã có bị bỏ qua, cán bộ, các dòng cần lưu ý) → **Nhập**. Có nút **Tải file mẫu** và
**Hoàn tác** cho từng lần nhập (xoá đúng các hồ sơ của lần đó). Tên cán bộ mới trong cột CBTL: tick để tạo
tài khoản (chưa có mật khẩu), bỏ tick để hồ sơ Chưa phân công. Logic đọc file nằm ở `backend/importer.js`.

**Dòng lệnh:**

```powershell
cd backend
node scripts/import-excel.js "C:\duong\dan\so.xlsx"                       # chạy thử, chỉ ghi báo cáo
node scripts/import-excel.js "C:\duong\dan\so.xlsx" --commit --replace-imported   # nhập lại (xoá bản nhập trước)
```

- Đọc sheet tổng "THỦ TỤC HÀNH CHÍNH - 2026" + 4 sheet theo loại (gộp theo số biên nhận, hoặc tên + địa chỉ + ngày nhận).
- Gộp ~55 cách ghi loại hồ sơ về loại chuẩn; ~85 cách ghi CBTL về 29 cán bộ (bảng `OFFICER_ALIASES`).
  Cán bộ chưa có tài khoản được tạo mới **chưa có mật khẩu** — đặt mật khẩu trong trang Quản trị.
- Sửa năm gõ nhầm (vd. 22/10/2022 nằm giữa các dòng 2026 → 2026). Mọi chỉnh sửa / dòng bỏ qua ghi trong `backend/import-reports/<thời điểm>/issues.csv`.
- Không nhập trùng: nếu DB đã có hồ sơ nhập từ Excel, phải thêm `--replace-imported`.

## Phân quyền

Cột nhạy cảm: `chiDaoLanhDao`, `mucDoUuTien` (Mức độ ưu tiên nội bộ).

| Role    | Xem hồ sơ        | Cột nhạy cảm        | Tạo | Sửa                    | Xoá |
|---------|------------------|---------------------|-----|------------------------|-----|
| ADMIN   | Tất cả           | Có                  | Có  | Tất cả trường          | Có  |
| VAN_THU | Tất cả           | Có                  | Có  | Tất cả trường          | Không |
| CAN_BO  | Chỉ của mình     | Bị xoá khỏi response | Không | `trangThai`, `ghiChuCanBo` trên hồ sơ của mình | Không |

## Quản trị hệ thống (`/admin`, chỉ ADMIN)

- **Tài khoản:** thêm, sửa họ tên / vai trò, đặt lại mật khẩu, khoá / mở khoá, xoá.
  - Khoá tài khoản: không đăng nhập được, token đang dùng cũng bị từ chối.
  - Đặt lại mật khẩu: mọi phiên cũ của người đó bị đăng xuất.
  - Chặn: tự đổi vai trò / tự khoá / tự xoá; làm hệ thống mất ADMIN cuối cùng; đổi vai trò hoặc xoá cán bộ còn hồ sơ thụ lý.
- **Email khi tạo tài khoản:** form bắt buộc nhập email; nếu tick "Gửi tên đăng nhập & mật khẩu", backend gửi email chào mừng (tên đăng nhập, mật khẩu ban đầu, vai trò, nút Đăng nhập). Gửi lỗi thì tài khoản vẫn được tạo và trang quản trị báo để gửi thủ công.
  - Cấu hình Gmail trong `backend/.env`: bật Xác minh 2 bước → tạo **App Password** tại https://myaccount.google.com/apppasswords → điền `SMTP_USER` (Gmail gửi đi) và `SMTP_PASS` (App Password 16 ký tự, không phải mật khẩu Gmail). Xem `backend/.env.example`.
- **Phân quyền:** ma trận chỉ đọc, sinh từ `PERMISSIONS`, `WRITABLE_FIELDS`, `ROW_SCOPED_ROLES` trong `backend/server.js`. Cấp quyền cho người dùng bằng cách đổi vai trò.

## API

- `POST /api/auth/login` (public), `GET /api/auth/me`
- `GET|POST /api/admin/users`, `PUT|DELETE /api/admin/users/:id`, `PUT /api/admin/users/:id/password`, `GET /api/admin/permissions`
- `GET /api/meta`, `GET /api/users?role=CAN_BO`
- `POST /api/auth/change-password`, `POST /api/auth/forgot` (public), `POST /api/auth/reset-password` (public)
- `GET /api/dossiers?page&pageSize&q&quick&phanLoai&trangThai&canBo&sort&dir` (không có `page` → trả toàn bộ),
  `GET /api/dossiers/stats`, `GET /api/dossiers/ids`, `GET /api/dossiers/lookup?q=`, `GET /api/dossiers/upcoming`, `GET /api/dossiers/:id`
- `GET|POST /api/dossiers/:id/attachments`, `GET /api/attachments/:id/download`, `DELETE /api/attachments/:id`
- `POST /api/dossiers`, `PUT /api/dossiers/:id` (`lyDo` khi chuyển cán bộ / gia hạn), `DELETE /api/dossiers/:id`
