<script setup lang="ts">
import type { Purpose } from './presets';

import { reactive } from 'vue';

import ImageCropper from './components/ImageCropper.vue';

interface DemoResult {
  url: string;
  size: number;
  type: string;
}

const DEMOS: { purpose: Purpose; title: string; desc: string }[] = [
  {
    purpose: 'avatar',
    title: 'avatar',
    desc: 'JPEG q0.9, cap 512px — ảnh đại diện, nét đủ cho khuôn mặt.',
  },
  {
    purpose: 'thumbnail',
    title: 'thumbnail',
    desc: 'JPEG q0.8, cap 256px — ảnh preview siêu nhẹ.',
  },
  {
    purpose: 'content',
    title: 'content',
    desc: 'JPEG q0.85, cap 1600px — ảnh chèn trong nội dung, cân bằng.',
  },
  {
    purpose: 'document',
    title: 'document',
    desc: 'PNG nét tối đa (tới 4000px), không xóa nền — lưu ảnh tài liệu.',
  },
  {
    purpose: 'signature',
    title: 'signature',
    desc: 'PNG nền trong suốt, cỡ stamp nhẹ — để đóng dấu vào PDF.',
  },
  {
    purpose: 'banner',
    title: 'banner',
    desc: 'JPEG q0.88, cap 2560px — ảnh bìa/hero khổ rộng, độ phân giải cao.',
  },
  {
    purpose: 'original',
    title: 'original',
    desc: 'PNG không nén, không giảm kích thước — giữ sát ảnh gốc nhất.',
  },
];

const results = reactive<Record<string, DemoResult | null>>({});

function onDone(purpose: Purpose, blob: Blob, dataUrl: string) {
  results[purpose] = { url: dataUrl, size: blob.size, type: blob.type };
}
</script>

<template>
  <div class="page">
    <h1>Image Crop — Mock</h1>
    <p class="desc">
      Cùng một component dùng chung (cắt + xóa nền + xuất). Mỗi demo bên dưới chỉ
      khác nhau prop <code>purpose</code> → ra chất lượng/định dạng khác nhau.
    </p>

    <section v-for="demo in DEMOS" :key="demo.purpose" class="demo">
      <h2>
        <code>purpose="{{ demo.title }}"</code>
      </h2>
      <p class="demo-desc">{{ demo.desc }}</p>

      <ImageCropper
        :purpose="demo.purpose"
        @done="(blob, url) => onDone(demo.purpose, blob, url)"
      />

      <div v-if="results[demo.purpose]" class="emitted">
        <h3>
          Sự kiện <code>done</code> đã phát
          ({{ (results[demo.purpose]!.size / 1024).toFixed(1) }} KB,
          {{ results[demo.purpose]!.type }})
        </h3>
        <a :href="results[demo.purpose]!.url" download="output">
          Tải ảnh kết quả
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  max-width: 820px;
  margin: 40px auto;
  padding: 0 20px;
  font-family: system-ui, sans-serif;
}
.desc {
  color: #666;
  margin-bottom: 8px;
}
.demo {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 2px solid #eee;
}
.demo h2 {
  font-size: 18px;
  margin-bottom: 4px;
}
.demo-desc {
  color: #666;
  margin-bottom: 16px;
}
.emitted {
  margin-top: 20px;
  padding: 12px 16px;
  background: #fafafa;
  border: 1px dashed #ddd;
  border-radius: 6px;
}
.emitted h3 {
  font-size: 15px;
  margin: 0 0 8px;
}
</style>
