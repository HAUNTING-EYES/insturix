# Video Datasets for Testing & Benchmarking

## Status: Compiled in editron 25 (2026-05-24)

## Free Datasets

| Source | What | Link |
|--------|------|------|
| Pexels talking head | 6,237+ clips | https://www.pexels.com/search/videos/talking%20head/ |
| Pexels interview | 6,927+ clips | https://www.pexels.com/search/videos/interview/ |
| Pexels API | Programmatic access | https://www.pexels.com/api/ |
| TalkingHead-1KH | CC BY 3.0, YouTube | https://github.com/tcwang0509/TalkingHead-1KH |
| TalkVid | 1244 hours, 7729 speakers | https://github.com/FreedomIntelligence/TalkVid |
| AVE | ECCV 2022, AI editing benchmark | https://github.com/dawitmureja/AVE |
| Awesome Video Datasets | Master list | https://github.com/xiaobai1217/Awesome-Video-Datasets |
| Awesome Video Editing | Papers + datasets | https://github.com/wentianli/awesome-video-editing |

## What We Need for TAG Testing
- **Speech-dominant**: Talking head, interview, lecture (existing system should work unchanged)
- **Music-dominant**: Music video, dance, concert (TAG must handle beat-aligned editing)
- **Visual-dominant**: Product b-roll, timelapse, sports highlights (TAG must handle scene-boundary editing)
- **Hybrid**: Podcast with music intro, tutorial with demo sections (TAG must handle mode switching)
- **Silent/ambient**: ASMR, nature footage (TAG must handle minimal-signal content)

Tags: #research #datasets #testing
