/** Lưu một Blob (vd. file Excel từ API) thành file tải về. */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Trình duyệt cần URL thêm một nhịp để bắt đầu tải.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** yyyy-mm-dd theo giờ máy người dùng (dùng đặt tên file). */
export const todayStamp = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
