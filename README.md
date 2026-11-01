# crop-image

Mock độc lập cho một **component crop ảnh dùng chung** (cắt + xóa nền/viền thừa) trước
khi port vào `80-ui`. Cắt chữ ký chỉ là **một** trong nhiều mục đích sử dụng. Stack khớp
runtime với 80-ui: Vue 3.5 + antdv-next 1.x + `vue-advanced-cropper`.

## Chạy

```bash
pnpm install
pnpm dev        # mở http://localhost:5190
pnpm test       # unit test cho lib lõi
pnpm build      # kiểm tra bundle
pnpm drive      # (cần dev server) Playwright: upload ảnh tổng hợp → popup → Xác nhận → chụp shot-*.png
```

## Feature

- Upload ảnh PNG/JPG → **popup ngay sau upload** với khung đã tự cắt sẵn (Xác nhận luôn hoặc chỉnh trước).
- **Auto-trim**: tự phát hiện bounding box nội dung (sample nền từ viền + tolerance) → khung cắt gợi ý.
- **Crop thủ công (tùy chọn)**: kéo/resize/zoom/xoay khung trong popup (`vue-advanced-cropper`).
- **Toggle nền trong suốt**: nền near-background → alpha 0 (PNG); preview xóa nền ngay trong khung (lazy + cache).
- Xuất `Blob` qua sự kiện `done(blob, dataUrl)`.

## Chất lượng theo `purpose` (policy vs mechanism)

Component lo cơ chế (cắt + xóa nền + xuất); **module quyết chất lượng** qua prop `purpose`
(một preset), có thể override từng núm hoặc truyền `config` custom. Thứ tự ưu tiên:
`DEFAULTS < preset(purpose) < config{} < prop lẻ`, rồi clamp an toàn (cạnh + ngân sách megapixel).

```vue
<ImageCropper purpose="signature" @done="onDone" />   <!-- PNG trong suốt -->
<ImageCropper purpose="thumbnail" @done="onDone" />   <!-- JPEG siêu nhẹ -->
<ImageCropper purpose="document" :output-max-edge="2000" @done="onDone" /> <!-- override -->
```

Preset có sẵn: `avatar`, `thumbnail`, `content`, `document`, `signature`, `banner`, `original`
(xem [`src/presets.ts`](src/presets.ts)).

## Thư viện & lý do (hạn chế tự code)

| Việc | Giải pháp | Lý do |
|---|---|---|
| Crop UI (kéo/resize/zoom/xoay) | `vue-advanced-cropper` | Vue 3 tốt, set khung ban đầu bằng code → nạp kết quả auto-trim gọn. |
| Auto-trim + xóa nền | `lib/imageProcessing.ts` (thuần) | Sample nền từ viền + tolerance per-channel; nhanh, không tải model. (ML `@imgly/background-removal` bị loại: model vài chục MB, thừa.) |

## An toàn máy yếu

- Hiển thị/phân tích trên bản display ≤1500px (cố định) → tương tác mượt bất kể ảnh gốc.
- Giữ **ImageBitmap** capped (edge + megapixel budget) thay canvas 2D khổng lồ; crop xuất bằng **1 `drawImage`** ra đúng kích thước output.
- Xóa nền preview lazy + cache; loading liền mạch khi đổi ảnh, không nháy.
- Còn hở (ngoài scope): decode đầu vẫn full-res; keyout+encode vẫn sync main-thread → ảnh cực lớn muốn tuyệt đối không freeze cần Web Worker/OffscreenCanvas.

## Cấu trúc & port

- `src/lib/imageProcessing.ts` — logic pixel **thuần** (không DOM), unit-test trong node.
- `src/lib/canvasUtils.ts` — wrapper canvas (decodeSource, bitmapToCanvas, fitWithin, canvasToBlob…).
- `src/presets.ts` — bảng preset `purpose` + `resolveConfig`/clamp.
- `src/composables/useImageCrop.ts` — xử lý ảnh + state, độc lập UI.
- `src/components/ImageCropper.vue` — component tái sử dụng (**thứ sẽ port sang 80-ui**).
- `src/App.vue` — sân khấu demo (7 preset).

Spec thiết kế gốc (lịch sử): `docs/2026-10-27-signature-crop-design.md`.
