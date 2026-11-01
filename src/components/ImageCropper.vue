<script setup lang="ts">
import type { Bounds } from '../lib/imageProcessing';
import type { Purpose, QualityConfig } from '../presets';

import { computed, ref, watch } from 'vue';

import {
  Button,
  message,
  Modal,
  Space,
  Spin,
  Switch,
  Upload,
  UploadDragger,
} from 'antdv-next';
import { Cropper } from 'vue-advanced-cropper';
import 'vue-advanced-cropper/dist/style.css';

import { useImageCrop } from '../composables/useImageCrop';
import { resolveConfig } from '../presets';

const props = withDefaults(
  defineProps<{
    /** Named quality intent. Modules usually only set this. */
    purpose?: Purpose;
    /** Full custom quality config (sits above the preset). */
    config?: Partial<QualityConfig>;
    maxSizeMB?: number;
    // --- individual knob overrides (highest precedence) ---
    sourceMaxEdge?: number;
    outputMaxEdge?: number;
    outputType?: string;
    quality?: number;
    defaultTransparent?: boolean;
    /** Max per-channel colour distance from background still treated as background. */
    tolerance?: number;
  }>(),
  {
    purpose: 'signature',
    maxSizeMB: 20,
  },
);

/** DEFAULTS < preset(purpose) < config{} < explicit props, then clamped. */
const quality = computed(() =>
  resolveConfig({
    purpose: props.purpose,
    config: props.config,
    overrides: {
      sourceMaxEdge: props.sourceMaxEdge,
      outputMaxEdge: props.outputMaxEdge,
      type: props.outputType,
      quality: props.quality,
      defaultTransparent: props.defaultTransparent,
      tolerance: props.tolerance,
    },
  }),
);

const emit = defineEmits<{
  cancel: [];
  done: [blob: Blob, dataUrl: string];
}>();

const ACCEPT = ['image/png', 'image/jpeg'];

const modalOpen = ref(false);
const processing = ref(false);
const analyzing = ref(false);
const cropperRef = ref<{
  getResult: () => { coordinates: Bounds } | null;
  setCoordinates: (coords: Bounds) => void;
} | null>(null);
// Crop box captured right before a plain<->keyed swap, so toggling transparency
// does not reset the user's framing. Null = use the auto-detected default box.
const savedCoords = ref<Bounds | null>(null);
// True from the moment the cropper src changes until the new image is ready, so
// the reload is hidden behind a spinner instead of a visible flicker.
const swapping = ref(false);
const {
  hasImage,
  displaySrc,
  detected,
  bgModel,
  transparent,
  preparingPreview,
  resultUrl,
  prepareImage,
  exportImage,
  resetImage,
} = useImageCrop(quality);

// A changing src means the cropper is reloading; cover it until @ready fires.
watch(displaySrc, (src: string) => {
  swapping.value = !!src;
});

// One loading state over both the keyout build and the image reload.
const busy = computed(() => preparingPreview.value || swapping.value);
const busyText = computed(() =>
  preparingPreview.value ? 'Đang xóa nền…' : 'Đang cập nhật…',
);

const showChecker = computed(
  () => transparent.value || !!bgModel.value?.transparent,
);
const bgColorStyle = computed(() =>
  !transparent.value && bgModel.value && !bgModel.value.transparent
    ? {
        '--crop-bg': `rgb(${bgModel.value.r}, ${bgModel.value.g}, ${bgModel.value.b})`,
      }
    : {},
);

async function handleFile(file: File) {
  if (!ACCEPT.includes(file.type)) {
    message.error('Chỉ nhận ảnh PNG hoặc JPG');
    return Upload.LIST_IGNORE;
  }
  if (file.size > props.maxSizeMB * 1024 * 1024) {
    message.error(`Ảnh vượt quá ${props.maxSizeMB}MB`);
    return Upload.LIST_IGNORE;
  }

  analyzing.value = true;
  try {
    savedCoords.value = null; // a fresh image uses the auto-detected box
    const bounds = await prepareImage(file);
    if (!bounds) {
      message.warning('Không phát hiện nét rõ ràng — dùng toàn ảnh.');
    }
    modalOpen.value = true; // popup ngay sau khi chọn ảnh
  } catch {
    message.error('Không đọc được ảnh');
  } finally {
    analyzing.value = false;
  }

  return Upload.LIST_IGNORE; // never auto-upload
}

function defaultSize({
  imageSize,
}: {
  imageSize: { height: number; width: number };
}) {
  return detected.value
    ? { width: detected.value.width, height: detected.value.height }
    : { width: imageSize.width, height: imageSize.height };
}

function defaultPosition() {
  return detected.value
    ? { left: detected.value.left, top: detected.value.top }
    : { left: 0, top: 0 };
}

// Capture the current box before the transparency toggle swaps the image src.
function onToggle() {
  savedCoords.value = cropperRef.value?.getResult()?.coordinates ?? null;
}

// After the (re)loaded image is ready, restore the captured box so a toggle
// keeps the user's framing instead of snapping back to the default.
function onCropperReady() {
  if (savedCoords.value) cropperRef.value?.setCoordinates(savedCoords.value);
  swapping.value = false; // new image is in place — reveal it
}

async function confirm() {
  processing.value = true;
  try {
    const result = await exportImage(cropperRef.value?.getResult()?.coordinates);
    if (!result) {
      message.error('Chưa có vùng cắt');
      return;
    }
    modalOpen.value = false;
    emit('done', result.blob, result.url);
    message.success('Đã xuất ảnh');
  } catch {
    message.error('Xuất ảnh thất bại');
  } finally {
    processing.value = false;
  }
}

function closeModal() {
  modalOpen.value = false;
  emit('cancel');
}

function reopen() {
  if (hasImage.value) modalOpen.value = true;
}

</script>

<template>
  <div class="image-cropper">
    <Spin :spinning="analyzing" description="Đang phân tích ảnh…">
      <UploadDragger
        :before-upload="handleFile"
        :show-upload-list="false"
        accept="image/png,image/jpeg"
        :max-count="1"
        :disabled="analyzing"
      >
        <p class="hint-title">Kéo thả hoặc bấm để chọn ảnh</p>
        <p class="hint-sub">PNG / JPG, tối đa {{ maxSizeMB }}MB</p>
      </UploadDragger>
    </Spin>

    <Modal
      v-model:open="modalOpen"
      title="Cắt ảnh"
      :width="680"
      :confirm-loading="processing"
      :mask-closable="false"
      ok-text="Xác nhận"
      cancel-text="Huỷ"
      @ok="confirm"
      @cancel="closeModal"
    >
      <div class="modal-body">
        <div class="toggle-row">
          <span>Nền trong suốt</span>
          <Switch
            v-model:checked="transparent"
            :loading="busy"
            @change="onToggle"
          />
        </div>
        <Spin :spinning="busy" :description="busyText">
          <div
            class="editor"
            :class="{ 'editor--checker': showChecker }"
            :style="bgColorStyle"
          >
            <Cropper
              v-if="modalOpen && hasImage"
              ref="cropperRef"
              class="cropper"
              :src="displaySrc"
              :default-size="defaultSize"
              :default-position="defaultPosition"
              image-restriction="none"
              @ready="onCropperReady"
            />
          </div>
        </Spin>
        <p class="hint-sub">
          Khung đã tự cắt sát nội dung. Bạn có thể kéo/chỉnh khung rồi bấm Xác
          nhận, hoặc bấm Xác nhận luôn để dùng khung tự động.
        </p>
      </div>
    </Modal>

    <div v-if="resultUrl" class="result">
      <p class="hint-sub">Kết quả (nền ca-rô = vùng trong suốt):</p>
      <div class="checkerboard">
        <img :src="resultUrl" alt="Ảnh đã cắt" />
      </div>
      <Space class="result-actions">
        <Button @click="reopen">Chỉnh lại</Button>
        <Button @click="resetImage">Chọn ảnh khác</Button>
      </Space>
    </div>
  </div>
</template>

<style scoped>
.image-cropper {
  max-width: 720px;
}
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.editor {
  background: #fafafa;
  border: 1px solid #eee;
}
.cropper {
  height: 380px;
}
/* Behind the (always keyed-out) image: the sampled paper colour when the toggle
   is off, falling back to a neutral surface. This also replaces the cropper's
   default black letterbox. */
.editor :deep(.vue-advanced-cropper__background) {
  background: var(--crop-bg, #f4f4f5);
}
/* With a checkerboard while "Nền trong suốt" is on, so the removed background is
   visible right inside the crop area. */
.editor--checker :deep(.vue-advanced-cropper__background) {
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #ddd 25%, transparent 25%),
    linear-gradient(-45deg, #ddd 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ddd 75%),
    linear-gradient(-45deg, transparent 75%, #ddd 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
}
.hint-title {
  font-size: 15px;
  font-weight: 500;
}
.hint-sub {
  color: #888;
  font-size: 13px;
}
.result {
  margin-top: 20px;
}
.result-actions {
  margin-top: 12px;
}
.checkerboard {
  display: inline-block;
  padding: 8px;
  background-image:
    linear-gradient(45deg, #ddd 25%, transparent 25%),
    linear-gradient(-45deg, #ddd 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ddd 75%),
    linear-gradient(-45deg, transparent 75%, #ddd 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
  border: 1px solid #eee;
}
.checkerboard img {
  display: block;
  max-width: 100%;
}
</style>
