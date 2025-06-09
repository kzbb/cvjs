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

// OpenCV.js準備完了後に呼ばれるメイン初期化関数
function initCineViewer() {
    console.log('CineViewer初期化開始');
    
    // OpenCV.jsが利用可能か最終確認
    if (typeof cv === 'undefined') {
        console.error('OpenCV.jsが利用できません');
        document.getElementById('pre').textContent = 'OpenCV.jsの読み込みに失敗しました';
        return;
    }
    
    console.log('OpenCV.jsバージョン:', cv.getBuildInformation());
    document.getElementById('pre').textContent = 'CineViewer準備完了';
    
    // 既存の初期化処理をここに移動
    initRecording();
    // その他の初期化処理...
}

// 後方互換性のため、既存のopcenvReady関数も残す
function opencvReady() {
    // この関数はindex.htmlから呼ばれる
    console.log('opencvReady called from HTML');
}

videoElm.addEventListener('loadeddata', videoReady);

let Module = {
    onRuntimeInitialized: opencvReady
}

// 録画関連の変数
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let supportedFormats = [];

// サポートされている録画形式を検出
function detectSupportedFormats() {
    const formats = [
        { mimeType: 'video/webm;codecs=vp9', extension: 'webm', name: 'WebM (VP9)' },
        { mimeType: 'video/webm;codecs=vp8', extension: 'webm', name: 'WebM (VP8)' },
        { mimeType: 'video/webm', extension: 'webm', name: 'WebM' },
        { mimeType: 'video/mp4;codecs=h264', extension: 'mp4', name: 'MP4 (H.264)' },
        { mimeType: 'video/mp4', extension: 'mp4', name: 'MP4' },
        { mimeType: 'video/x-matroska;codecs=avc1', extension: 'mkv', name: 'Matroska' }
    ];

    supportedFormats = formats.filter(format => 
        MediaRecorder.isTypeSupported(format.mimeType)
    );

    console.log('サポートされている録画形式:', supportedFormats);
    return supportedFormats;
}

// 最適な録画形式を取得
function getBestFormat() {
    if (supportedFormats.length === 0) {
        detectSupportedFormats();
    }
    
    // 優先順位: VP9 WebM > VP8 WebM > MP4 > その他
    const priority = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=h264', 'video/mp4'];
    
    for (const mimeType of priority) {
        const format = supportedFormats.find(f => f.mimeType === mimeType);
        if format) return format;
    }
    
    return supportedFormats[0] || { mimeType: 'video/webm', extension: 'webm', name: 'WebM (fallback)' };
}

// 録画機能の初期化
function initRecording() {
    const recordBtn = document.getElementById('recordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const recordingStatus = document.getElementById('recordingStatus');
    const formatSelect = document.getElementById('recordFormatSelect');
    const canvas = document.getElementById('canvas');

    // サポートされている形式を検出してセレクトボックスに追加
    detectSupportedFormats();
    populateFormatSelect();

    recordBtn.addEventListener('click', startRecording);
    stopRecordBtn.addEventListener('click', stopRecording);

    function populateFormatSelect() {
        // 既存のオプションをクリア（最初の「自動選択」は残す）
        while (formatSelect.children.length > 1) {
            formatSelect.removeChild(formatSelect.lastChild);
        }

        // サポートされている形式を追加
        supportedFormats.forEach(format => {
            const option = document.createElement('option');
            option.value = format.mimeType;
            option.textContent = format.name;
            formatSelect.appendChild(option);
        });

        // サポートされている形式が少ない場合の警告
        if (supportedFormats.length === 0) {
            recordingStatus.textContent = '警告: 録画形式がサポートされていません';
            recordBtn.disabled = true;
        } else if (supportedFormats.length === 1) {
            recordingStatus.textContent = `利用可能な形式: ${supportedFormats[0].name}のみ`;
        }
    }

    function getSelectedFormat() {
        const selectedMimeType = formatSelect.value;
        if (selectedMimeType) {
            return supportedFormats.find(f => f.mimeType === selectedMimeType);
        }
        return getBestFormat();
    }

    function startRecording() {
        try {
            const stream = canvas.captureStream(30); // 30fps
            const format = getSelectedFormat();
            
            console.log('使用する録画形式:', format);
            
            // MediaRecorderを初期化
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: format.mimeType
            });

            recordedChunks = [];
            
            mediaRecorder.ondataavailable = function(event) {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = function() {
                downloadRecording(format);
            };

            mediaRecorder.start();
            isRecording = true;
            
            // UIの更新
            recordBtn.disabled = true;
            stopRecordBtn.disabled = false;
            formatSelect.disabled = true;
            recordBtn.textContent = '録画中...';
            recordBtn.className = 'btn btn-warning';
            recordingStatus.textContent = `録画中... (${format.name})`;
            
        } catch (error) {
            console.error('録画開始エラー:', error);
            alert('録画を開始できませんでした: ' + error.message);
        }
    }

    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            
            // UIの更新
            recordBtn.disabled = false;
            stopRecordBtn.disabled = true;
            formatSelect.disabled = false;
            recordBtn.textContent = '録画開始';
            recordBtn.className = 'btn btn-danger';
            recordingStatus.textContent = 'ダウンロード準備中...';
        }
    }

    function downloadRecording(format) {
        const blob = new Blob(recordedChunks, {
            type: format.mimeType
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // ファイル名に現在の日時を含める
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        a.download = `cineviewer-recording-${timestamp}.${format.extension}`;
        
        document.body.appendChild(a);
        a.click();
        
        // クリーンアップ
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        recordingStatus.textContent = `ダウンロード完了 (${format.name})`;
        setTimeout(() => {
            recordingStatus.textContent = '';
        }, 3000);
    }
}
