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
        width: IMAGE_WIDTH, // 映像の幅
        height: IMAGE_HEIGHT, // 映像の高さ
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

    const cap = new cv.VideoCapture(videoElm);
    const src = new cv.Mat(videoElm.height, videoElm.width, cv.CV_8UC4);
    let dst = new cv.Mat();
    let roi = new cv.Mat();
    let tmp = new cv.Mat();

    cap.read(src);

    // 上下左右反転処理
    if (flip_v) cv.flip(src, src, 0);
    if (flip_h) cv.flip(src, src, 1);

    // 画像回転処理
    switch (rotateNum) {
        case 3:
            cv.rotate(src, src, cv.ROTATE_90_CLOCKWISE);
        case 2:
            cv.rotate(src, src, cv.ROTATE_90_CLOCKWISE);
        case 1:
            cv.rotate(src, src, cv.ROTATE_90_CLOCKWISE);
            break;
    }

    // 画像処理用キャンバスに出力
    cv.imshow('canvasSrc', src);

    if (!trackingSwitchFlag) {
        // トラッキングOFF時の処理
    const p1 = new cv.Point(Number(regpin_x.value) + 20, Number(regpin_y.value) + 20);
    const p2 = new cv.Point(Number(template_size.value) + Number(regpin_x.value) - 40, Number(template_size.value) + Number(regpin_y.value) - 40);

        const color = new cv.Scalar(255, 255, 255);
        const lcolor = new cv.Scalar(0, 0, 255);
        cv.rectangle(src, p1, p2, lcolor);

    const canvasTmpImage = ctxSrc.getImageData(Number(regpin_x.value) + 20, Number(regpin_y.value) + 20, Number(template_size.value) - 60, Number(template_size.value) - 60);
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

        let p_x = maxPoint.x;
        let p_y = maxPoint.y;

        statusText.innerHTML = "x:" + p_x + ", y:" + p_y;

        resImage.delete();
        mask.delete();

        ctx.drawImage(canvasSrcElm,
            Number(regpin_x.value) - maxPoint.x + 20,
            Number(regpin_y.value) - maxPoint.y + 20,
            IMAGE_WIDTH, IMAGE_HEIGHT);
    }

    src.delete();
    dst.delete();
    roi.delete();
    tmp.delete();

    frameCallbackId = videoElm.requestVideoFrameCallback(perFrame);
}

// 動画準備完了時の処理
function videoReady() {
    console.log('Video ready');
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
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=h264,aac', // Safari 17では不可、将来互換のため候補に
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
