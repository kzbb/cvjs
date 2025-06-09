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

// コントローラ設定
// 四角形のポジションとサイズを管理
const frame_x = document.getElementById("frame_x");
frame_x.min = 0;
frame_x.max = IMAGE_WIDTH;
frame_x.value = 50;

const frame_y = document.getElementById("frame_y");
frame_y.min = 0;
frame_y.max = IMAGE_HEIGHT;
frame_y.value = 100;

const frame_size = document.getElementById("frame_size");

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
        const p1 = new cv.Point(Number(frame_x.value) + 20, Number(frame_y.value) + 20);
        const p2 = new cv.Point(Number(frame_size.value) + Number(frame_x.value) - 40, Number(frame_size.value) + Number(frame_y.value) - 40);

        const color = new cv.Scalar(255, 255, 255);
        const lcolor = new cv.Scalar(0, 0, 255);
        cv.rectangle(src, p1, p2, lcolor);

        const canvasTmpImage = ctxSrc.getImageData(Number(frame_x.value) + 20, Number(frame_y.value) + 20, Number(frame_size.value) - 60, Number(frame_size.value) - 60);
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
            Number(frame_x.value) - maxPoint.x + 20,
            Number(frame_y.value) - maxPoint.y + 20,
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
