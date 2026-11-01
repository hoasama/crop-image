---
target: SignatureCropper.vue
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:D:\\Stack\\project\\monorepo\\anh\\sign-crop-mock\\src\\components\\SignatureCropper.vue"
target_fingerprint: "sha256:08afd77b6f854b55d1df3f4f2e7622c1bd7d120c4fce92e9e7bfb0f351a668dc"
target_path: "D:\\Stack\\project\\monorepo\\anh\\sign-crop-mock\\src\\components\\SignatureCropper.vue"
timestamp: 2026-10-29T14-36-21Z
slug: src-components-signaturecropper-vue
---
# Critique — SignatureCropper.vue (Operate)

Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Image processing (getImageData + sample + detect up to 3000px) runs synchronously with no spinner between file-select and modal-open; UI freezes. |
| 2 | Match System / Real World | 3 | Domain language is right ("Nền trong suốt", "nền ca-rô") but "Xác nhận" is vague for what is really "save sample signature". |
| 3 | User Control and Freedom | 2 | mask-closable=false + auto-open modal; "Chọn ảnh khác" is destructive with no confirm; no reset of crop box to auto frame after dragging. |
| 4 | Consistency and Standards | 2 | Third-party cropper visually foreign to antd; black letterbox bar is a non-standard broken-looking artifact. |
| 5 | Error Prevention | 2 | Format/size guards exist, but transparency defaults ON and is applied destructively at confirm with no preview; can erase real ink on dark-paper scans. |
| 6 | Recognition Rather Than Recall | 3 | Auto frame + hint reduce recall; but the transparency toggle's effect is only visible AFTER confirming and closing the modal. |
| 7 | Flexibility and Efficiency | 2 | No keyboard support, zoom/rotate not exposed (though PRODUCT claims them), no batch; repeat-use admin gets no acceleration. |
| 8 | Aesthetic and Minimalist Design | 2 | Empty dragger (no icon), dead gray canvas around a small crop box, and the black bar read as "unstyled" not "distilled". |
| 9 | Error Recovery | 3 | Error copy is specific and clear; "Xuất ảnh thất bại" is a dead end with no recovery hint. |
| 10 | Help and Documentation | 3 | Just-in-time hint is well placed and genuinely helpful. |
| **Total** | | **24/40** | **Acceptable** |

Max score: 40 (all 10 heuristics applied; none n/a).

## Design Specificity Verdict

Category-interchangeable with one authored idea buried inside. Two product-literate elements: the checkerboard transparency preview and auto-trim-on-open. But the headline capability — "save result image to server" — has ZERO representation in the UI. For a tool whose purpose is "prepare a clean signature and save it as the sample", that is the opposite of authored-for-this-product.

Deterministic scan: .vue file scan exit 0 / 0 findings but LOW SIGNAL (regex-only, no render analysis). URL scan of live render (http://localhost:5190/) exit 2, 2 warnings, both real:
- low-contrast at p.hint-sub: 3.4:1 (need 4.5:1), #888 on #fafafa ("PNG / JPG, tối đa 10MB"). WCAG AA fail.
- line-length at p.desc: ~109 chars/line (aim <80). (in App.vue)
Overlay injection succeeded; amber overlays rendered. A and B agree on the black letterbox bar (B confirmed in pixels) and the overall unfinished feel.

## Overall Impression

Flow works and has two good instincts (auto-trim, checkerboard preview), but the two most important moments are both compromised: the PEAK (modal opens snapped to the ink) is sabotaged by the black letterbox bar, and the END (saving the sample) only says "Đã xuất ảnh" with no confirmation it was saved to the server. Biggest opportunity: design the save moment first, crop second.

## What's Working

1. Auto-trim-on-open: crop box pre-fitted to detected ink bounds; honors "Xác nhận là đủ".
2. Checkerboard transparency preview: lets the admin verify the keyed-out background before trusting it on a PDF stamp — authored for signatures.
3. Honest, specific error copy + graceful "no clear signature detected, using whole image" fallback.

## Priority Issues

### [P0] Black letterbox bar destroys the core surface
Why: hits the eye at the peak moment, reads as a crash; on mobile swallows the viewport. Makes a "cần kết quả chuẩn" tool look broken. (A + B pixel-confirmed)
Fix: image-restriction="fit-area" (or "stencil"); cropper background #fafafa/checkerboard not black; responsive height min(60vh,420px) instead of fixed 380px.
Command: harden -> polish.

### [P0] Product headline feature (save to server) absent from UI
Why: button "Xác nhận", toast "Đã xuất ảnh", only "Chỉnh lại/Chọn ảnh khác"; admin can't tell if the sample is persisted. Specificity failure made concrete.
Fix: rename commit to "Lưu chữ ký mẫu"; after save show "Đã lưu chữ ký mẫu" + saved badge distinct from preview; model saved state explicitly.
Command: clarify (+ onboard for commit moment).

### [P1] Silent synchronous processing with no status
Why: large scans freeze the UI for a beat, no status, user may re-click or think it failed.
Fix: message.loading/spinner "Đang phân tích ảnh…" on dragger, disable while processing; move heavy work to worker/requestIdleCallback.
Command: animate or optimize.

### [P1] Mobile (380px) modal overflows and is barely usable
Why: :width=680 overflows at 380px, letterbox dominates, crop box becomes a sliver; Casey can't position it.
Fix: width min(680px,94vw), adaptive cropper height, adequate touch targets.
Command: adapt.

### [P2] Destructive transparency default-on, applied unpreviewed
Why: on dark-paper/low-contrast scans can erase real ink, discovered only post-save.
Fix: live transparency preview inside the modal when toggle is on; consider defaulting off; make it reversible on the result panel.
Command: harden.

Also [P2] low-contrast hint #888/#fafafa 3.4:1 -> raise to >=4.5:1; [P3] line-length p.desc -> cap max-width. (both from detector)

## Persona Red Flags

Jordan (first-time admin): empty dragger gives no sense of a good input; "you can drag the crop box" only via one 13px gray hint -> hits Xác nhận without knowing adjustment exists; black bar looks broken on first use.

Sam (accessibility): cropper handles not keyboard-operable -> cannot adjust crop without a mouse; "Nền trong suốt" is a loose <span>, label association unverified; status only via transient toasts (no persistent status region); primary/secondary distinction color-only.

Admin cấu hình chữ ký mẫu (PRODUCT persona): core need is trust that the saved sample is correct and persisted; UI fails exactly there — no save affordance, no saved-state indicator, no distinction between saved sample and throwaway preview, destructive un-previewable transparency.

## Minor Observations

- English page title "Signature Crop — Mock" atop an all-Vietnamese UI (violates "UI tiếng Việt").
- "Huỷ" should be "Hủy" (modern orthography).
- No filename/thumbnail of the uploaded file once the modal opens.
- .editor border/bg invisible behind full-bleed cropper (dead style).
- cropperRef typed any -> no type safety on getResult().

## Questions to Consider

1. If the point is saving a sample signature to the server, why no Save button, no saved state, and a toast that says "exported"? What changes if you design the save moment first?
2. Should transparency be a destructive confirm-time toggle, or a reversible property of the saved asset editable later without re-upload?
3. The box auto-fits so well the intended path is "just hit Xác nhận" — is a full drag-resize-zoom-rotate cropper the right primary surface, or over-tooled for a usually-one-click task?
