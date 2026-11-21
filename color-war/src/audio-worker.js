// 대결 소리 합성을 화면 스레드 밖에서 한다(폰에서 판 시작 때 멈칫하지 않게). 메인 화면 배경음도 여기서 한 번 만든다
import { renderAudio } from './audio.js';
import { renderLobby } from './ui-audio.js';
self.onmessage = (e) => {
  const { id, kind, log, duration, seed, musicOffset } = e.data;
  try {
    const pcm = kind === 'lobby' ? renderLobby() : renderAudio(log, duration, seed, { musicOffset });
    self.postMessage({ id, pcm }, [pcm.buffer]);
  } catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
};
