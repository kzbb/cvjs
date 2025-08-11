# CineViewerJS

[https://cvjs.bblab.org](https://cvjs.bblab.org)

スマートフォン等で簡易的に映画フィルムを見るためのツールです。

ウェブアプリケーションと、安価に制作できる接写装置とで構成されています。

## 取扱説明

装置およびソフトウェアの取扱説明については、[こちらを御覧ください(Google Document)](https://docs.google.com/document/d/15xXQPpMZY3nyn1pSox5meNvcxAUrkhTuqb-DUUvdU7g/edit?usp=sharing)。

## お問い合わせ

本件の利用に関してご不明な点がございましたら、[お問い合わせフォーム](https://docs.google.com/forms/d/e/1FAIpQLSd8uEuk0uNigsKV5c_y6TcLYYHeqDe2b2QC_RkfiC0bAbSHqA/viewform?usp=dialog)までご連絡いただけますと幸いです。

## 動画の保存

動画の保存は、ブラウザのMediaStream APIを用いてリアルタイムに録画し、その録画データをBlob形式で生成しています。
生成されたBlobデータはご利用中の端末のメモリ内に保持され、保存時はブラウザのファイル保存機能を通じて端末内の指定された領域に動画ファイルとして保存されます。
録画した動画データが外部に送信されることはありません。

すべての画像処理は端末上で実行され、動画データも端末内で管理されます。

動画保存時に「ダウンロード」と表示されますが、これはブラウザがファイルをローカルに保存する操作を示すものであり、ネットワーク経由の送受信をしているわけではありません。

## 謝辞

This work was supported by JSPS KAKENHI Grant Number JP22K00254.

本研究はJSPS科研費 JP22K00254の助成を受けたものです。
