const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ffmpegPath = path.join(__dirname, '.tools', 'ffmpeg.exe');
const outputPath = path.join(__dirname, 'dev_trailer.mp4');

// 15 seconds, 1280x720 (16:9), 30 fps
// Video: testsrc2 (vibrant moving color pattern, moving square, built-in timecode and frame counter)
// Audio: sine wave at 440 Hz (A4) with audible pulse every second so mute/unmute is unmistakably clear
// Video codec: libx264, profile baseline/main, yuv420p, faststart (web/mobile optimized)
// Audio codec: aac, 128k, 44.1kHz stereo
const cmd = `"${ffmpegPath}" -y ` +
  `-f lavfi -i "testsrc2=duration=15:size=1280x720:rate=30" ` +
  `-f lavfi -i "sine=frequency=523.25:duration=15" ` + // C5 tone
  `-filter_complex "[1:a]volume='if(between(mod(t,1),0,0.25), 0.4, 0.04)'[a]" ` +
  `-map 0:v -map "[a]" ` +
  `-c:v libx264 -pix_fmt yuv420p -profile:v baseline -level 3.1 -movflags +faststart ` +
  `-c:a aac -b:a 128k -ar 44100 -ac 2 ` +
  `"${outputPath}"`;

console.log('Generating synthetic dev trailer...');
execSync(cmd, { stdio: 'inherit' });

const stat = fs.statSync(outputPath);
console.log(`dev_trailer.mp4 generated successfully! Size: ${stat.size} bytes`);
