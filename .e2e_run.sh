API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
# 1) script generation -> only last scene has punchline, rest none
echo "=== script sfx check ==="
curl -s -X POST $API/api/scripts/generate -H "Content-Type: application/json" -d '{"joke":"Un perro entra a un bar y pide una cerveza. El cantinero dice: aqui no servimos perros. El perro contesta: pues traeme un gato entonces.","language":"es","duration":20}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('sfx per scene:',[s['sfx'] for s in d['scenes']])"
# 2) character consistency via edit anchor
PID=$(curl -s -X POST $API/api/projects -H "Content-Type: application/json" -d '{"title":"ConsistTest","language":"es","topic":"animales","duration":15,"laugh_intensity":"loud"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "PID=$PID"
curl -s -X PUT $API/api/projects/$PID -H "Content-Type: application/json" -d '{"scenes":[{"index":0,"character_name":"Bob","dialogue":"Hola, soy Bob.","camera_motion":"zoom_in","sfx":"none","image_prompt":"a green alien named Bob with three eyes standing in a spaceship"},{"index":1,"character_name":"Bob","dialogue":"Y este es mi remate!","camera_motion":"zoom_in","sfx":"punchline","image_prompt":"the alien Bob eating a taco on a beach"}]}' >/dev/null
echo "gen image scene0 (text -> anchor)..."
curl -s -X POST $API/api/projects/$PID/scenes/0/generate-image -H "Content-Type: application/json" -d '{"scene":{"index":0,"character_name":"Bob","dialogue":"x","camera_motion":"zoom_in","sfx":"none","image_prompt":"a green alien named Bob with three eyes standing in a spaceship"},"characters":[],"language":"es"}' | python3 -c "import sys,json;print(' scene0 img',json.load(sys.stdin).get('asset_id'))"
echo "char_refs after scene0:"; curl -s $API/api/projects/$PID | python3 -c "import sys,json;print(json.load(sys.stdin).get('char_refs'))"
echo "gen image scene1 (edit from anchor)..."
curl -s -X POST $API/api/projects/$PID/scenes/1/generate-image -H "Content-Type: application/json" -d '{"scene":{"index":1,"character_name":"Bob","dialogue":"x","camera_motion":"zoom_in","sfx":"punchline","image_prompt":"the alien Bob eating a taco on a beach"},"characters":[],"language":"es"}' | python3 -c "import sys,json;print(' scene1 img',json.load(sys.stdin).get('asset_id'))"
# 3) music upload (reuse a tts clip as music) + render
VID=$(curl -s $API/api/voices | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['voice_id'])")
curl -s -X POST $API/api/tts/generate -H "Content-Type: application/json" -d "{\"text\":\"la la la la la la la la la la la la la la la\",\"voice_id\":\"$VID\"}" | python3 -c "import sys,json,urllib.request,os; d=json.load(sys.stdin); os.system('curl -s '+os.environ['API']+d['url']+' -o /tmp/music.mp3')" 
API=$API
curl -s $API$(curl -s -X POST $API/api/tts/generate -H "Content-Type: application/json" -d "{\"text\":\"tarara tarara musica de fondo suave para el video\",\"voice_id\":\"$VID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['url'])") -o /tmp/music.mp3
echo "music bytes: $(wc -c </tmp/music.mp3)"
curl -s -X POST $API/api/projects/$PID/music -F "file=@/tmp/music.mp3;type=audio/mpeg" | python3 -c "import sys,json;print('music upload:',json.load(sys.stdin).get('music_asset_id'))"
curl -s -X PUT $API/api/projects/$PID -H "Content-Type: application/json" -d '{"music_volume":25}' >/dev/null
echo "render..."; curl -s -X POST $API/api/projects/$PID/render >/dev/null
for i in $(seq 1 30); do sleep 6; ST=$(curl -s $API/api/projects/$PID/render-status); echo "$ST" | grep -qE 'completed|failed' && { echo "$ST"; break; }; done
VURL=$(curl -s $API/api/projects/$PID | python3 -c "import sys,json;print(json.load(sys.stdin).get('video_url',''))")
curl -s $API$VURL -o /tmp/consist.mp4
python3 -c "import imageio_ffmpeg,subprocess; p=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-i','/tmp/consist.mp4'],capture_output=True,text=True); print([l.strip() for l in p.stderr.splitlines() if 'Duration' in l or 'Audio' in l])"
# save scene images for visual check
curl -s $API/api/projects/$PID | python3 -c "import sys,json,os; d=json.load(sys.stdin); a=[s['image_asset_id'] for s in d['scenes']]; [os.system('curl -s '+os.environ['API']+'/api/assets/'+x+' -o /tmp/bob'+str(i)+'.png') for i,x in enumerate(a)]"
echo "PID=$PID" > /tmp/consist_pid.txt
