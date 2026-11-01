# Thiết kế: Feature crop ảnh chữ ký số (sign-crop-mock)

Ngày: 2026-10-27 · Trạng thái: đã duyệt, đang triển khai mock

## Mục tiêu

Cho phép người dùng upload ảnh chữ ký (PNG/JPG, thường là ảnh chụp/scan trên nền
giấy trắng), **tự động cắt bỏ viền/nền thừa** quanh nét chữ ký, cho người dùng
**tinh chỉnh khung cắt thủ công**, và **tùy chọn làm nền trắng thành trong suốt**
(PNG alpha) để đóng dấu lên PDF chỉ thấy nét chữ ký.

Dựng **mock standalone** trước (`sign-crop-mock`), sau đó port `SignatureCropper.vue`
+ `lib/` vào 80-ui (`apps/admin`).

## Phạm vi (scope)

- IN: upload file PNG/JPG, auto-trim gợi ý khung, crop thủ công (kéo/resize/zoom/xoay),
  toggle nền trong suốt, xuất PNG + preview.
- OUT (mock không làm): vẽ chữ ký trực tiếp (signature pad), dán clipboard, gọi API
  server, tách nền ảnh phức tạp bằng ML.

## Quyết định thiết kế

- **Approach A**: dùng 1 lib crop UI (`vue-advanced-cropper`) + util canvas tự viết
  nhỏ cho auto-trim & transparency. Lý do: ít dependency, không tải model ML, chạy
  nhanh, nền giấy trắng xử lý bằng threshold luminance là đủ và sạch.
- **Không dùng** `@imgly/background-removal` (ML, tải model vài chục MB — thừa cho
  chữ ký nền giấy) và `trim-canvas` (chỉ trim pixel trong suốt, vẫn phải threshold trước).
- Stack mock khớp runtime với 80-ui: `vue ^3.5`, `antdv-next ^1.4`.

## Kiến trúc

```
sign-crop-mock/
├─ index.html
├─ package.json            # vue, antdv-next, vue-advanced-cropper, vite, vitest
├─ vite.config.ts
├─ tsconfig.json
├─ src/
│  ├─ main.ts
│  ├─ App.vue              # sân khấu demo
│  ├─ lib/
│  │  ├─ signatureImage.ts # LÕI thuần: detectContentBounds, makeBackgroundTransparent
│  │  └─ canvasUtils.ts    # wrapper DOM/canvas: loadImage, imageToCanvas, exportSignature
│  └─ components/
│     └─ SignatureCropper.vue  # component tái sử dụng (thứ sẽ port sang 80-ui)
└─ test/
   └─ signatureImage.test.ts   # unit test cho lib lõi
```

Ranh giới: `signatureImage.ts` là logic pixel **thuần** (nhận `ImageData`-like, không
đụng DOM) → test được trong môi trường node, không cần canvas. `canvasUtils.ts` bọc
phần phụ thuộc DOM. `SignatureCropper.vue` là UI mỏng.

## API `lib/signatureImage.ts` (pure)

```ts
interface Bounds { left; top; width; height }             // px
interface SimpleImageData { data; width; height }          // giống ImageData
interface BackgroundModel { transparent; r; g; b }         // nền ước lượng từ viền

sampleBackground(img, alphaFloor=16): BackgroundModel
detectContentBounds(img, { background?, tolerance=32, alphaFloor=16, padding=0 }): Bounds | null
makeBackgroundTransparent(img, { background?, tolerance=32, alphaFloor=16 }): void
```

**KHÔNG giả định nền trắng tinh.** `sampleBackground` lấy per-channel median các pixel
viền ảnh → màu nền thực tế (hoặc "transparent" nếu viền trong suốt). Một pixel là
"mực" (content) khi: `alpha >= alphaFloor` VÀ khác màu nền > `tolerance` (max per-channel).
→ xử lý đúng nền off-white/xám (scan, JPEG, `#ebebeb`), nền màu, và PNG trong suốt có
pixel rìa alpha thấp. `detectContentBounds` gom min/max x,y các pixel content →
bounding box (+ padding, clamp biên); toàn nền → `null`.

> Bẫy đã gặp+fix (2026-10-27): bản đầu dùng ngưỡng luminance cứng 240 → nền off-white
> (lum<240) bị coi là mực ⇒ không trim + không trong suốt; và chỉ bỏ alpha===0 ⇒ pixel
> rìa alpha≈4 làm box phình cả ảnh. Root cause: phân loại nền quá cứng. Fix: sample nền
> từ viền. Component sample nền 1 lần từ ảnh đầy đủ (còn lề) rồi truyền `background` cho
> cả detect lẫn transparency trên vùng crop.

## API `lib/canvasUtils.ts` (DOM)

```ts
loadImage(File|Blob|string): Promise<HTMLImageElement>
imageToCanvas(img, maxEdge=3000): HTMLCanvasElement   // downscale ảnh quá lớn
canvasToBlob(canvas, type='image/png'): Promise<Blob>
exportSignature(canvas, { cropBox?, transparent?, bgThreshold? }): Promise<Blob>
```

## Component `SignatureCropper.vue` (luồng popup)

- Props: `maxSizeMB=10`, `bgThreshold=240`, `defaultTransparent=true`.
- Emits: `done(blob, dataUrl)`, `cancel()`.
- Luồng: `Upload` (beforeUpload chặn auto-upload) → `loadImage` → `imageToCanvas`
  → `detectContentBounds` → **mở `Modal` ngay** (popup). Trong modal: `<Cropper>`
  với `defaultSize`/`defaultPosition` = bounding box auto + `Switch` "Nền trong suốt".
  User có thể bấm **Xác nhận luôn** (dùng khung auto) hoặc kéo/chỉnh khung trước.
- Xác nhận → `cropper.getResult().canvas` → (nếu bật) `makeBackgroundTransparent`
  → `toBlob` → đóng modal → preview trên nền ca-rô + `emit('done')`.
- Sau khi có kết quả: nút **"Chỉnh lại"** (mở lại modal cùng ảnh) và **"Chọn ảnh khác"**.
- `<Cropper>` dùng `v-if="modalOpen && imageSrc"` để mount lại mỗi lần mở modal
  (khung auto tính lại), tránh phụ thuộc prop `destroyOnClose`.

## Data flow

```
File → dataURL → <img> → canvas → ImageData
     → detectContentBounds() → initial cropBox (defaultSize/Position)
     → MỞ MODAL (popup) → <Cropper> (user Xác nhận luôn hoặc chỉnh)
     → getResult().canvas
     → [transparent?] makeBackgroundTransparent()
     → toBlob('image/png') → đóng modal → preview + emit done
```

Tất cả chạy trong browser; mock không gọi server.

## Verify (đã chạy thật)

- `scripts/drive.mjs` (Playwright): sinh ảnh chữ ký tổng hợp → upload → popup mở
  tự động với khung auto-fit → bấm Xác nhận → ảnh cắt sát + nền trong suốt +
  `done` phát blob PNG. Chụp `shot-modal.png` / `shot-result.png` (gitignored).
- `pnpm test` (6 pass), `pnpm typecheck`, `pnpm build` đều xanh.

## Error handling

- Sai định dạng (ngoài PNG/JPG) hoặc quá `maxSizeMB` → `message.error`, chặn đọc file.
- `detectContentBounds` trả `null` (toàn nền) → `message.warning`, fallback khung =
  toàn ảnh.
- Ảnh quá lớn → `imageToCanvas` downscale cạnh dài về ≤ 3000px trước khi xử lý.
- `loadImage` lỗi → `message.error('Không đọc được ảnh')`.

## Testing

- Unit (Vitest, env node) cho `signatureImage.ts`:
  - `detectContentBounds`: ảnh toàn trắng → `null`; nét đen → box đúng; padding clamp
    biên; bỏ qua pixel trong suốt.
  - `makeBackgroundTransparent`: pixel near-white → alpha 0; nét mực tối → giữ alpha.
- Manual: `pnpm dev`, upload vài mẫu chữ ký thật, kiểm mắt (nhất là vùng trong suốt
  trên nền ca-rô).

## Kế hoạch port vào 80-ui (sau khi mock OK)

1. Copy `src/lib/signatureImage.ts` + `canvasUtils.ts` → `packages/utils` (hoặc module
   dùng chung của admin).
2. Copy `SignatureCropper.vue` → `apps/admin` (module liên quan chữ ký/eSign).
3. Thêm dependency `vue-advanced-cropper` vào catalog + app admin.
4. Nối `@done(blob)` vào luồng ký số hiện có (đóng dấu ảnh lên PDF).
