require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const { subDays, addDays } = require('date-fns');
const { User, Dossier } = require('./models');
const { loadSettings } = require('./settings');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quanlyhoso';
// Mật khẩu chung cho tài khoản demo; đổi bằng SEED_PASSWORD trong .env nếu cần.
const SEED_PASSWORD = process.env.SEED_PASSWORD || '123456';

const USERS = [
  { username: 'admin', hoTen: 'Lãnh đạo / Admin', role: 'ADMIN' },
  { username: 'canbo_a', hoTen: 'Nguyễn Văn A', role: 'CAN_BO' },
  { username: 'canbo_b', hoTen: 'Trần Thị B', role: 'CAN_BO' },
  { username: 'vanthu', hoTen: 'Văn thư', role: 'VAN_THU' },
];

// ngayVao lệch so với hôm nay để dữ liệu mẫu có đủ: quá hạn, sắp đến hạn, còn hạn.
const buildDossiers = ({ canbo_a: canBoA, canbo_b: canBoB }) => {
  const today = new Date();
  return [
    { maHoSo: 'HS-001', tenHoSo: 'Cấp phép xây dựng nhà ở riêng lẻ', donViGui: 'UBND Phường 12', phanLoai: 'XAC_NHAN_NHA', ngayVao: subDays(today, 10), canBoThuLy: canBoA, ghiChuCanBo: 'Đang chờ bổ sung bản vẽ hiện trạng', chiDaoLanhDao: 'Ưu tiên xử lý, báo cáo trước 15h', mucDoUuTien: 'KHAN_CAP', trangThai: 'DANG_XU_LY' },
    { maHoSo: 'HS-002', tenHoSo: 'Đăng ký kinh doanh hộ cá thể', donViGui: 'Bộ phận Một cửa', phanLoai: 'XAC_NHAN_NHA', ngayVao: subDays(today, 3), canBoThuLy: canBoA, ghiChuCanBo: 'Vừa nhận bàn giao từ Văn thư', chiDaoLanhDao: null, mucDoUuTien: 'TRUNG_BINH', trangThai: 'MOI_TIEP_NHAN' },
    { maHoSo: 'HS-003', tenHoSo: 'Chuyển nhượng quyền sử dụng đất', donViGui: 'Văn phòng Đăng ký đất đai', phanLoai: 'CAP_PHEP_XD', ngayVao: subDays(today, 11), canBoThuLy: canBoA, ghiChuCanBo: 'Đã trình Lãnh đạo phòng xem xét lần 1', chiDaoLanhDao: 'Phối hợp phòng TN-MT kiểm tra thực địa', mucDoUuTien: 'CAO', trangThai: 'CHO_LANH_DAO_DUYET' },
    { maHoSo: 'HS-004', tenHoSo: 'Thẩm định dự án đầu tư khu thương mại', donViGui: 'Sở Kế hoạch & Đầu tư', phanLoai: 'CAP_GCN', ngayVao: subDays(today, 2), canBoThuLy: canBoA, ghiChuCanBo: '', chiDaoLanhDao: null, mucDoUuTien: 'TRUNG_BINH', trangThai: 'MOI_TIEP_NHAN' },
    { maHoSo: 'HS-005', tenHoSo: 'Khiếu nại đền bù giải phóng mặt bằng', donViGui: 'Ban Tiếp công dân', phanLoai: 'CAP_PHEP_XD', ngayVao: subDays(today, 20), canBoThuLy: canBoB, ghiChuCanBo: 'Đã mời các bên đối thoại lần 2', chiDaoLanhDao: 'Tổ chức đối thoại với công dân', mucDoUuTien: 'KHAN_CAP', trangThai: 'DANG_XU_LY' },
    { maHoSo: 'HS-006', tenHoSo: 'Cấp đổi giấy chứng nhận quyền sử dụng đất', donViGui: 'Bộ phận Một cửa', phanLoai: 'XAC_NHAN_NHA', ngayVao: subDays(today, 1), canBoThuLy: canBoB, ghiChuCanBo: '', chiDaoLanhDao: null, mucDoUuTien: 'THAP', trangThai: 'MOI_TIEP_NHAN' },
    { maHoSo: 'HS-007', tenHoSo: 'Quy hoạch chi tiết khu dân cư tỷ lệ 1/500', donViGui: 'Sở Quy hoạch - Kiến trúc', phanLoai: 'CAP_GCN', ngayVao: subDays(today, 25), canBoThuLy: canBoB, ghiChuCanBo: 'Đang tổng hợp ý kiến cộng đồng', chiDaoLanhDao: 'Lấy ý kiến cộng đồng dân cư', mucDoUuTien: 'CAO', trangThai: 'DANG_XU_LY' },
    { maHoSo: 'HS-008', tenHoSo: 'Hỗ trợ doanh nghiệp nhỏ và vừa', donViGui: 'Hiệp hội Doanh nghiệp', phanLoai: 'CAP_PHEP_XD', ngayVao: addDays(today, 1), canBoThuLy: canBoA, ghiChuCanBo: '', chiDaoLanhDao: null, mucDoUuTien: 'THAP', trangThai: 'MOI_TIEP_NHAN' },
    { maHoSo: 'HS-009', tenHoSo: 'Cấp giấy phép lái xe quốc tế', donViGui: 'Sở Giao thông Vận tải', phanLoai: 'XAC_NHAN_NHA', ngayVao: subDays(today, 15), canBoThuLy: canBoB, ghiChuCanBo: 'Đã trả kết quả cho công dân', chiDaoLanhDao: null, mucDoUuTien: 'TRUNG_BINH', trangThai: 'HOAN_THANH' },
    { maHoSo: 'HS-010', tenHoSo: 'Thu hồi đất thực hiện dự án giao thông', donViGui: 'Ban QLDA Giao thông', phanLoai: 'CAP_GCN', ngayVao: subDays(today, 28), canBoThuLy: canBoA, ghiChuCanBo: 'Đã trình phương án bồi thường', chiDaoLanhDao: 'Rà soát lại phương án bồi thường', mucDoUuTien: 'CAO', trangThai: 'CHO_LANH_DAO_DUYET' },
    { maHoSo: 'HS-011', tenHoSo: 'Đăng ký khai sinh có yếu tố nước ngoài', donViGui: 'Phòng Tư pháp', phanLoai: 'CAP_PHEP_XD', ngayVao: subDays(today, 5), canBoThuLy: canBoB, ghiChuCanBo: 'Chờ xác minh giấy tờ hợp pháp hoá lãnh sự', chiDaoLanhDao: null, mucDoUuTien: 'TRUNG_BINH', trangThai: 'DANG_XU_LY' },
    { maHoSo: 'HS-012', tenHoSo: 'Cấp phép khai thác nước ngầm', donViGui: 'Công ty CP Cấp nước', phanLoai: 'CAP_GCN', ngayVao: subDays(today, 8), canBoThuLy: canBoA, ghiChuCanBo: 'Đang lấy mẫu kiểm định chất lượng nước', chiDaoLanhDao: 'Lấy ý kiến Sở Tài nguyên và Môi trường', mucDoUuTien: 'THAP', trangThai: 'DANG_XU_LY' },
  ];
};

async function seed() {
  await mongoose.connect(MONGO_URI);
  await loadSettings(); // thời hạn / ngày làm việc đang cấu hình
  // Che user:password khi in log.
  console.log(`Seeding ${MONGO_URI.replace(/\/\/[^@/]+@/, '//***@')} ...`);

  // Seed XOÁ SẠCH hồ sơ và tài khoản. Chặn khi database đã có dữ liệu thật (hồ sơ nhập từ Excel,
  // hồ sơ / tài khoản không thuộc bộ demo) — trừ khi chạy với --force.
  if (!process.argv.includes('--force')) {
    const demoCodes = buildDossiers({}).map((d) => d.maHoSo);
    const realDossiers = await Dossier.countDocuments({ $or: [{ nguonNhap: { $exists: true } }, { maHoSo: { $nin: demoCodes } }] });
    const realUsers = await User.countDocuments({ username: { $nin: USERS.map((u) => u.username) } });
    if (realDossiers > 0 || realUsers > 0) {
      throw new Error(
        `Database đang có ${realDossiers} hồ sơ và ${realUsers} tài khoản không phải dữ liệu demo — seed sẽ XOÁ HẾT. ` +
          'Không chạy seed trên database thật. Nếu chắc chắn muốn xoá và tạo lại dữ liệu demo: npm run seed -- --force'
      );
    }
  }

  await Promise.all([Dossier.deleteMany({}), User.deleteMany({})]);

  const users = await Promise.all(
    USERS.map(async (data) => {
      const user = new User(data);
      await user.setPassword(SEED_PASSWORD);
      return user.save();
    })
  );
  const idByUsername = Object.fromEntries(users.map((user) => [user.username, user._id]));

  // Dùng create() (gọi .save() từng bản ghi) để hook auto-date được kích hoạt.
  const dossiers = await Dossier.create(buildDossiers(idByUsername));

  console.log(`Đã tạo ${users.length} users và ${dossiers.length} hồ sơ.`);
  console.log(`Mật khẩu đăng nhập của các tài khoản demo: ${process.env.SEED_PASSWORD ? '(theo SEED_PASSWORD)' : SEED_PASSWORD}`);
  users.forEach((user) => console.log(`  ${user.role.padEnd(8)} ${user.username.padEnd(10)} ${user._id}`));
}

seed()
  .catch((error) => {
    console.error('Seed thất bại:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
