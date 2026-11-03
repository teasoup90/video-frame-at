# Decoding test fixture

`colors.webm` is a synthetic video generated independently using an existing local FFmpeg installation, with no external source material. It is 32 by 32 pixels, runs at 10 fps for 3 seconds, and uses lossless VP9 encoding: red from 0 to 1 seconds, green from 1 to 2 seconds, and blue from 2 to 3 seconds. Tests check the dominant pixel color to verify that seeking selects the correct time interval.

To regenerate it from the library directory:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i "color=c=red:s=32x32:r=10:d=1" -f lavfi -i "color=c=green:s=32x32:r=10:d=1" -f lavfi -i "color=c=blue:s=32x32:r=10:d=1" -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]" -map "[v]" -c:v libvpx-vp9 -lossless 1 -y tests/fixtures/colors.webm
```

This fixture is distributed with the library under the MIT license. FFmpeg is not required to run the existing tests; the browser decodes the committed file directly.
