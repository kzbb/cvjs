// Copyright (c) 2025 Kazuyuki Baba
// Released under the MIT license
// https://www.lab-bb.org/cvjs/MITLicense.txt

// カメラからの映像を受けるビデオ要素を作成
const videoElm = document.createElement('video');
videoElm.setAttribute('playsinline', ''); // モバイルブラウザでの全画面再生を防ぐ
videoElm.setAttribute('autoplay', ''); // 自動再生を有効化
videoElm.setAttribute('muted', ''); // 音声をミュート

// 結果表示用のキャンバス要素を取得
const canvasElm = document.getElementById('canvas');
const ctx = canvasElm.getContext('2d'); // 2D描画コンテキストを取得

// 画像処理用のキャンバス要素を取得
const canvasSrcElm = document.getElementById('canvasSrc');
const ctxSrc = canvasSrcElm.getContext('2d');
const canvasRoiElm = document.getElementById('canvasRoi');
const ctxRoi = canvasRoiElm.getContext('2d');
const canvasTmpElm = document.getElementById('canvasTmp');
const ctxTmp = canvasTmpElm.getContext('2d');

// フラグ管理
let readyFlag = 0; // 処理準備状態を示すフラグ
let frameCallbackId; // フレームコールバックID
let trackingSwitchFlag = false; // トラッキングのON/OFF状態
// 録画関連
let mediaRecorder = null;
let recordedBlobs = [];
let recordTimerId = null;
let recordStartEpoch = 0;
let captureStream = null;

// 画像サイズの定義
const IMAGE_WIDTH = 480; // 画像の幅
const IMAGE_HEIGHT = 270; // 画像の高さ

// カメラ設定
const cameraSettings = {
    audio: false, // 音声を無効化
    video: {
        width: { ideal: IMAGE_WIDTH }, // 映像の幅（ideal指定で縦向きでも失敗しない）
        height: { ideal: IMAGE_HEIGHT }, // 映像の高さ（ideal指定で縦向きでも失敗しない）
        facingMode: 'user', // フロントカメラを使用
    }
};

// コントローラ設定（レジストレーション／テンプレート）
// パーフォレーション位置（X/Y）とテンプレートサイズを管理
const regpin_x = document.getElementById("regpin_x");
regpin_x.min = 0;
regpin_x.max = IMAGE_WIDTH;
regpin_x.value = 50;

const regpin_y = document.getElementById("regpin_y");
regpin_y.min = 0;
regpin_y.max = IMAGE_HEIGHT;
regpin_y.value = 100;

const template_size = document.getElementById("template_size");

// 上下左右反転スイッチ
let flip_v = false; // 垂直反転フラグ
document.getElementById('flipSwitchV').addEventListener('change', function () {
    flip_v = this.checked;
});

let flip_h = false; // 水平反転フラグ
document.getElementById('flipSwitchH').addEventListener('change', function () {
    flip_h = this.checked;
});

// 画像回転設定
let rotateNum = 0; // 回転状態を管理
setRotation(); // 初期回転設定

// 画面の向き変更時に回転設定を更新
if (screen.orientation) {
    screen.orientation.addEventListener('change', setRotation);
} else {
    window.addEventListener('orientationchange', setRotation);
}

// 端末の縦向き横向きを判定して初期値を設定する関数
function setRotation() {
    let orientation =
        (screen.orientation || {}).type ||
        screen.mozOrientation ||
        screen.msOrientation;

    if (
        orientation === "landscape-primary" ||
        orientation === "landscape-secondary"
    ) {
        rotateNum = 0; // 横向きの場合
    } else if (
        orientation === "portrait-secondary" ||
        orientation === "portrait-primary"
    ) {
        rotateNum = 1; // 縦向きの場合
    } else if (orientation === undefined) {
        rotateNum = 0;
        console.log("このブラウザーは画面方向 API に対応していません :(");
    }
}

// 回転ボタンを押したときの処理
const rotateElm = document.getElementById("rotate");
rotateElm.addEventListener('click', () => {
    ++rotateNum;
    if (rotateNum > 3) rotateNum = 0;
});

// カメラのリスト要素を取得
const cameraSelectElm = document.getElementById('cameraSelect');

// スマホ判定関数
function isMobile() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

// カメラデバイスリストを取得
navigator.mediaDevices.enumerateDevices().then(devices => {
    if (isMobile()) {
        // モバイルデバイスの場合
        const option1 = document.createElement('option');
        option1.value = 'user';
        option1.text = 'Front-camera';
        cameraSelectElm.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = 'environment';
        option2.text = 'Rear-camera';
        cameraSelectElm.appendChild(option2);
    } else {
        // デスクトップデバイスの場合
        devices.forEach(device => {
            if (device.kind === 'videoinput') {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${cameraSelectElm.length + 1}`;
                cameraSelectElm.appendChild(option);
            }
        });
    }
});

// 選択されたカメラを使用
cameraSelectElm.addEventListener('change', () => {
    const deviceId = cameraSelectElm.value;
    if (deviceId) {
        if (isMobile()) {
            cameraSettings.video.facingMode = deviceId;
        } else {
            cameraSettings.video.deviceId = deviceId;
        }
        navigator.mediaDevices.getUserMedia(cameraSettings)
            .then(stream => {
                videoElm.srcObject = stream;
                videoElm.play();
            })
            .catch(err => {
                console.log('Error accessing camera: ', err);
            });
    }
});

// カメラを取得して映像を表示
navigator.mediaDevices.getUserMedia(cameraSettings)
    .then(stream => {
        videoElm.srcObject = stream;
        videoElm.play();
    })
    .catch(err => {
        const preElm = document.getElementById('pre');
        preElm.innerHTML = `カメラの取得に失敗しました: ${err.name}`;
        console.error('Error accessing camera:', err);
    });

// トラッキングのON/OFFスイッチ
const statusText = document.getElementById('trackingStatus');
document.getElementById('trackingSwitch').addEventListener('change', function () {
    if (this.checked) {
        statusText.innerHTML = 'ON';
        trackingSwitchFlag = true;
    } else {
        statusText.innerHTML = '';
        trackingSwitchFlag = false;
    }
});

// 動画の各フレーム処理
function perFrame() {
    if (readyFlag !== 3) return;

    const vw = videoElm.videoWidth;
    const vh = videoElm.videoHeight;
    if (vw === 0 || vh === 0) {
        frameCallbackId = videoElm.requestVideoFrameCallback(perFrame);
        return;
    }

    // 縦長の場合は中央を横長に切り出す（横長はそのまま）
    let srcX = 0, srcY = 0, srcW = vw, srcH = vh;
    if (vh > vw) {
        srcH = Math.floor(vw * IMAGE_HEIGHT / IMAGE_WIDTH);
        srcY = Math.floor((vh - srcH) / 2);
    }

    // スライダーの最大値を実際のフレームサイズに合わせる
    if (Number(regpin_x.max) !== srcW) {
        regpin_x.max = srcW;
        if (Number(regpin_x.value) > srcW) regpin_x.value = srcW;
    }
    if (Number(regpin_y.max) !== srcH) {
        regpin_y.max = srcH;
        if (Number(regpin_y.value) > srcH) regpin_y.value = srcH;
    }

    // canvasSrcに描画（切り出し範囲 → canvasSrc全体）
    canvasSrcElm.width = srcW;
    canvasSrcElm.height = srcH;
    ctxSrc.drawImage(videoElm, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    let src = cv.imread(canvasSrcElm);
    let dst = new cv.Mat();
    let roi = new cv.Mat();
    let tmp = new cv.Mat();

    // 上下左右反転処理
    if (flip_v) cv.flip(src, src, 0);
    if (flip_h) cv.flip(src, src, 1);

    // 反転後をcanvasSrcに反映
    cv.imshow('canvasSrc', src);

    if (!trackingSwitchFlag) {
        // トラッキングOFF時の処理
        const p1 = new cv.Point(Number(regpin_x.value), Number(regpin_y.value));
        const p2 = new cv.Point(Number(regpin_x.value) + Number(template_size.value), Number(regpin_y.value) + Number(template_size.value));

        const lcolor = new cv.Scalar(255, 255, 255, 255);
        cv.rectangle(src, p1, p2, lcolor);

        const canvasTmpImage = ctxSrc.getImageData(Number(regpin_x.value), Number(regpin_y.value), Number(template_size.value), Number(template_size.value));
        tmp = cv.matFromImageData(canvasTmpImage);
        cv.imshow('canvasTmp', tmp);

        src.copyTo(dst);
        cv.imshow('canvas', dst);
    } else {
        // トラッキングON時の処理
        const canvasTmpImage = ctxTmp.getImageData(0, 0, canvasTmpElm.width, canvasTmpElm.height);
        tmp = cv.matFromImageData(canvasTmpImage);

        let resImage = new cv.Mat();
        let mask = new cv.Mat();
        cv.matchTemplate(src, tmp, resImage, cv.TM_CCOEFF_NORMED, mask);
        let result = cv.minMaxLoc(resImage, mask);
        let maxPoint = result.maxLoc;

        statusText.innerHTML = "x:" + maxPoint.x + ", y:" + maxPoint.y;

        resImage.delete();
        mask.delete();

        // サイズ変化時のみリサイズ（width/height代入でcanvasがクリアされるため）
        if (canvasElm.width !== srcW || canvasElm.height !== srcH) {
            canvasElm.width = srcW;
            canvasElm.height = srcH;
        }
        // 前のフレームの上に重ねて描画（クリアせず蓄積）
        ctx.drawImage(canvasSrcElm,
            Number(regpin_x.value) - maxPoint.x,
            Number(regpin_y.value) - maxPoint.y);
    }

    src.delete();
    dst.delete();
    roi.delete();
    tmp.delete();

    frameCallbackId = videoElm.requestVideoFrameCallback(perFrame);
}

// 動画準備完了時の処理
function videoReady() {
    if (readyFlag & 2) return; // 既に初期化済み（2重発火防止）
    // videoWidthが0の場合はまだ準備できていないので待つ
    if (videoElm.videoWidth === 0) {
        videoElm.addEventListener('playing', videoReady, { once: true });
        return;
    }
    console.log('Video ready', videoElm.videoWidth, videoElm.videoHeight);
    readyFlag |= 2;
    videoElm.width = videoElm.videoWidth;
    videoElm.height = videoElm.videoHeight;
    perFrame();
}

// OpenCV.js準備完了時の処理
function opencvReady() {
    console.log('OpenCV.js is ready');
    readyFlag |= 1;

    const preElm = document.getElementById('pre');
    preElm.innerHTML = "";

    perFrame();
}

videoElm.addEventListener('loadeddata', videoReady);
videoElm.addEventListener('playing', videoReady, { once: true });

let Module = {
    onRuntimeInitialized: opencvReady
}

// ===== Canvas録画のセットアップ =====
const recStartBtn = document.getElementById('recStart');
const recPauseBtn = document.getElementById('recPause');
const recStopBtn = document.getElementById('recStop');
const recIndicator = document.getElementById('recIndicator');
const recTimer = document.getElementById('recTimer');
const recDownload = document.getElementById('recDownload');
const recPreview = document.getElementById('recPreview');
const recFormat = document.getElementById('recFormat');
const recNote = document.getElementById('recNote');

function formatTime(ms){
    const sec = Math.floor(ms/1000);
    const m = Math.floor(sec/60).toString().padStart(2,'0');
    const s = (sec%60).toString().padStart(2,'0');
    return `${m}:${s}`;
}

function updateTimer(){
    const ms = Date.now() - recordStartEpoch;
    recTimer.textContent = formatTime(ms);
}

function pickMimeType(){
    const candidates = [
        'video/mp4;codecs=avc1',   // Safari/iOS
        'video/mp4;codecs=h264',   // Chrome 130+
        'video/mp4',               // 汎用MP4フォールバック
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
    ];
    for(const type of candidates){
        if(MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

function shortMimeLabel(type){
    if(!type) return 'Auto';
    const t = type.toLowerCase();
    if(t.includes('video/webm;codecs=vp9')) return 'WebM/VP9';
    if(t.includes('video/webm;codecs=vp8')) return 'WebM/VP8';
    if(t.startsWith('video/webm')) return 'WebM';
    if(t.includes('video/mp4') || t.includes('h264')) return 'MP4/H.264';
    return 'Auto';
}

function setupRecorder(){
    // 既存のストリーム/レコーダーを停止
    try { mediaRecorder && mediaRecorder.state !== 'inactive' && mediaRecorder.stop(); } catch {}
    try { captureStream && captureStream.getTracks().forEach(t=>t.stop()); } catch {}
    recordedBlobs = [];

    // Canvasのフレームレート（24.00fps）
    const fps = 24.00;
    captureStream = canvasElm.captureStream(fps);
    const mimeType = pickMimeType();
    const options = mimeType ? { mimeType } : {};
    recFormat.textContent = `Format: ${shortMimeLabel(mimeType)} • ${Math.round(fps)}fps`;

    try{
        mediaRecorder = new MediaRecorder(captureStream, options);
    }catch(e){
        recNote.textContent = 'MediaRecorderの初期化に失敗しました。ブラウザの対応状況をご確認ください。';
        console.error(e);
        return false;
    }

    mediaRecorder.ondataavailable = (event)=>{
        if(event.data && event.data.size > 0){
            recordedBlobs.push(event.data);
        }
    };
    mediaRecorder.onstart = ()=>{
        recIndicator.classList.remove('d-none');
        recDownload.classList.add('d-none');
        recPreview.classList.add('d-none');
        recNote.textContent = '';
        recordStartEpoch = Date.now();
        recordTimerId = setInterval(updateTimer, 500);
        updateTimer();
    };
    mediaRecorder.onstop = ()=>{
        clearInterval(recordTimerId);
        updateTimer();
        recIndicator.classList.add('d-none');

        const blob = new Blob(recordedBlobs, { type: mediaRecorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        recPreview.src = url;
        recPreview.classList.remove('d-none');
        recDownload.href = url;
        const ext = (mediaRecorder.mimeType||'video/webm').includes('mp4') ? 'mp4' : 'webm';
        recDownload.download = `cvjs-recording-${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`;
        recDownload.classList.remove('d-none');
    };
    mediaRecorder.onerror = (e)=>{
        console.error('MediaRecorder error:', e);
        recNote.textContent = '録画中にエラーが発生しました。';
    };
    return true;
}

function setRecButtonsState(state){
    // state: idle | recording | paused
    if(state==='idle'){
        recStartBtn.disabled = false;
        recPauseBtn.disabled = true;
        recStopBtn.disabled = true;
    }else if(state==='recording'){
        recStartBtn.disabled = true;
        recPauseBtn.disabled = false;
        recStopBtn.disabled = false;
        recPauseBtn.textContent = 'Pause';
    }else if(state==='paused'){
        recStartBtn.disabled = true;
        recPauseBtn.disabled = false;
        recStopBtn.disabled = false;
        recPauseBtn.textContent = 'Resume';
    }
}

setRecButtonsState('idle');

recStartBtn.addEventListener('click', ()=>{
    if(!setupRecorder()) return;
    try{
        mediaRecorder.start(1000); // 1sごとにデータを分割
        setRecButtonsState('recording');
    }catch(e){
        console.error(e);
        recNote.textContent = '録画を開始できませんでした。';
    }
});

recPauseBtn.addEventListener('click', ()=>{
    if(!mediaRecorder) return;
    try{
        if(mediaRecorder.state === 'recording'){
            mediaRecorder.pause();
            setRecButtonsState('paused');
            if(recordTimerId){ clearInterval(recordTimerId); }
        }else if(mediaRecorder.state === 'paused'){
            mediaRecorder.resume();
            setRecButtonsState('recording');
            recordStartEpoch = Date.now() - (parseInt(recTimer.textContent.split(':')[0])*60 + parseInt(recTimer.textContent.split(':')[1]))*1000;
            recordTimerId = setInterval(updateTimer, 500);
        }
    }catch(e){
        console.error(e);
    }
});

recStopBtn.addEventListener('click', ()=>{
    if(!mediaRecorder) return;
    try{
        mediaRecorder.stop();
        setRecButtonsState('idle');
        if(captureStream){ captureStream.getTracks().forEach(t=>t.stop()); }
    }catch(e){
        console.error(e);
    }
});
