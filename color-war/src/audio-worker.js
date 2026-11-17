// 대결 소리 합성을 화면 스레드 밖에서 한다(폰에서 판 시작 때 멈칫하지 않게)
import { renderAudio } from './audio.js';
self.onmessage = (e) => {
  const { id, log, duration, seed } = e.data;
  try {
    const pcm = renderAudio(log, duration, seed);
    self.postMessage({ id, pcm }, [pcm.buffer]);
  } catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
};
