# API facts (checked 26-27 Oct 2026)

Sources: https://dev.meta.ai/llms.txt (every docs page also has a `.md` version).

## Meta Model API
- Base URL `https://api.meta.ai/v1`, header `Authorization: Bearer $META_API_KEY`. OpenAI-compatible Chat Completions and Responses.
- Model `muse-spark-1.3`. Always reasons: `reasoning_effort` is `minimal|low|medium|high|xhigh|max`; `"none"` returns 400.
- Tool calling: `tool_choice` must be `"auto"` (anything else returns 400).
- Images in: `{"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}`, up to 50 MB.
- Price per 1M tokens: $1.25 input, $0.15 cached input, $4.25 output. Limits: 3,000 requests and 4M tokens per minute.
- Measured from Hanoi, 26 Oct, `minimal`, 1280px PNG + ~1k tokens, streamed time to first token: p50 2.05 s, p90 4.46 s.

## Muse Image
- `POST /v1/images/generations`, model `muse-image-1.0`, returns `data[0].b64_json` (WEBP). `reasoning_strength`: `high` (default) or `low` (faster).
- $0.01 per image. Measured 27 Oct: 11.4 s at default strength.

## Muse Voice Transcribe (realtime)
- `wss://api.meta.ai/v1/asr/realtime`. First JSON text frame within 10 s:
  `{"authorization":{"accessToken":"Bearer <key>"},"audioEncoding":"PCM_24KHZ","model":"muse-voice-transcribe-1.0","mode":"PUSH_TO_TALK"}`.
  The HTTP Authorization header is ignored.
- Audio: binary frames of raw s16le mono PCM at 24 kHz, paced at real time (server rejects > 5 s ahead).
- `PUSH_TO_TALK` ends with a transcript event marked `final: true`. 25 languages. $0.18 per audio hour.

## Baseten (rival)
- `https://inference.baseten.co/v1`, header `Authorization: Api-Key $BASETEN_API_KEY`. Model `meta-models/muse-spark-open` (the `-1026` id in the hackathon brief does not exist). Measured p50 2.13 s to first token. Same price as Muse Spark.

## ElevenLabs
- `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`, header `xi-api-key`, body `{"text","model_id":"eleven_flash_v2_5"}`, returns MP3.
