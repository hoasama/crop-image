# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Người dùng chính là **quản trị viên cấu hình chữ ký mẫu** cho hệ thống (bối cảnh
80-ui / admin C08). Tình huống: trong trang quản trị, admin chuẩn bị một ảnh chữ ký /
con dấu sạch (từ ảnh scan/chụp nền giấy) để hệ thống dùng chung làm chữ ký mẫu.
Admin không phải người dùng số đông; họ thao tác có chủ đích, ít lần, cần kết quả chuẩn.

## Product Purpose

Cho phép admin upload ảnh chữ ký, **tự cắt bỏ viền/nền thừa** (auto-trim), **tinh chỉnh
khung cắt thủ công** trong popup, **tùy chọn xóa nền thành trong suốt**, rồi **lưu ảnh
kết quả xuống server** để dùng làm chữ ký mẫu. Thành công = ảnh chữ ký gọn, nền sạch,
sẵn sàng đóng dấu lên tài liệu/PDF — đạt được nhanh và ít thao tác.

Ở trạng thái hiện tại, đây là **project demo/thử nghiệm** (`sign-crop-mock`) để chốt
hành vi & UX trước khi (nếu quyết định) đưa vào 80-ui. Chưa cam kết port.

## Positioning

Cơ chế phân biệt: auto-trim dựa trên **lấy mẫu màu nền thực tế từ viền ảnh** (không giả
định nền trắng tinh) kết hợp **crop thủ công trong popup** — xử lý sạch ảnh scan nền
off-white/xám và PNG nền trong suốt, mà **không cần model ML nặng**. Nhẹ, chạy trong
trình duyệt, khớp stack hiện có.

## Operating Context

- Luồng admin: mở màn cấu hình → upload ảnh PNG/JPG (ảnh chụp/scan chữ ký trên giấy) →
  popup hiện ngay với khung đã tự cắt sát → admin chỉnh khung nếu muốn → bật/tắt nền
  trong suốt → Xác nhận → ảnh kết quả được lưu xuống server.
- Toàn bộ chỉnh ảnh diễn ra client-side; **bước lưu kết quả là ghi xuống server** (không
  phải chỉ giữ trong trình duyệt).
- Liên quan: hệ 80-ui (Vben admin), luồng ký số đóng dấu ảnh chữ ký lên PDF.

## Capabilities and Constraints

Đã có (mock hiện tại):
- Upload PNG/JPG (chặn sai định dạng / quá cỡ).
- Auto-trim: ước lượng màu nền từ viền + dò bounding box nét mực → khung cắt gợi ý.
- Crop thủ công trong popup (kéo/resize/zoom/xoay).
- Toggle "nền trong suốt" (near-background → alpha), preview trên nền ca-rô.
- Phát sự kiện `done(blob, dataUrl)` với ảnh PNG đã xử lý.

Ràng buộc phải giữ:
- **UI tiếng Việt** là ngôn ngữ chính.
- **Ảnh kết quả phải được lưu xuống server** (persistence là một phần của tính năng,
  không chỉ xử lý cục bộ).

Chưa quyết định (không được bịa):
- API/endpoint, định dạng payload và cách lưu ảnh xuống server — mock hiện dừng ở phát
  `blob`, **chưa nối API lưu server**.
- Việc port vào 80-ui có diễn ra hay không.

## Brand Commitments

Tên nội bộ: `sign-crop-mock`. Ngôn ngữ giao diện: tiếng Việt. Chưa có bộ nhận diện/logo
ràng buộc nào khác.

## Evidence on Hand

- Mã nguồn hiện tại: `src/components/SignatureCropper.vue`, `src/lib/signatureImage.ts`
  (logic pixel thuần, 9 unit test pass), `src/lib/canvasUtils.ts`, `src/App.vue`.
- Spec thiết kế: `docs/2026-10-27-signature-crop-design.md`.
- Script kiểm chứng Playwright: `scripts/drive.mjs`.
- Không có khách hàng thật, số liệu, hay testimonial — không được bịa.

## Product Principles

1. **Admin-first, ít thao tác**: tối ưu cho người cấu hình có chủ đích; mặc định thông
   minh (khung auto điền sẵn) để Xác nhận là đủ.
2. **Giữ nhẹ**: ưu tiên thư viện trưởng thành + thuật toán pixel nhỏ; tránh phụ thuộc
   nặng (ML) khi threshold/sampling là đủ.
3. **An toàn với ảnh thật**: không giả định nền trắng tinh; đo nền thực tế để trim/tách
   nền đúng trên scan và PNG trong suốt.
4. **Kết quả dùng được & lưu tin cậy**: đầu ra phải sẵn sàng đóng dấu và được lưu xuống
   server một cách rõ ràng.

## Accessibility & Inclusion

UI tiếng Việt. Chưa thiết lập yêu cầu chuẩn a11y cụ thể cho project demo này.
