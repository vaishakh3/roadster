"""Fetch/check official CC0 Coastal Cliff01 inputs and prepare compact UV maps.

Authoring dependencies: Pillow, NumPy. Originals remain in --source (outside
tracked runtime assets). Re-run the Blender geometry script against that folder.
"""
from argparse import ArgumentParser
from hashlib import md5, sha256
from pathlib import Path
from urllib.request import urlopen
import json
import numpy as np
from PIL import Image

parser=ArgumentParser();parser.add_argument('--source',required=True)
args=parser.parse_args();root=Path(__file__).resolve().parents[1]
source=Path(args.source).resolve();source.mkdir(parents=True,exist_ok=True)
metadata=json.loads((root/'assets/coastal-scan/source-files.json').read_text())
files=metadata['gltf']['1k']['gltf']
jobs=[('coastal_cliff_01.gltf',files)]+list(files['include'].items())
report={'asset':'https://polyhaven.com/a/coastal_cliff_01','license':'CC0-1.0','source':{},'runtime':{}}
for name, entry in jobs:
    path=source/name;path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists(): path.write_bytes(urlopen(entry['url']).read())
    blob=path.read_bytes();assert md5(blob).hexdigest()==entry['md5'], f'Source checksum mismatch: {path}'
    report['source'][name]={'url':entry['url'],'bytes':len(blob),'md5':entry['md5'],'sha256':sha256(blob).hexdigest()}
textures=source/'textures';runtime=root/'assets/runtime'
Image.open(textures/'coastal_cliff_01_diff_1k.jpg').convert('RGB').save(runtime/'coastal_scan_color.webp',quality=92,method=6,exact=True)
image=np.asarray(Image.open(textures/'coastal_cliff_01_nor_gl_1k.jpg').convert('RGB'),dtype=np.float32)
vectors=(image/127.5-1).reshape(512,2,512,2,3).mean(axis=(1,3))
vectors/=np.maximum(np.linalg.norm(vectors,axis=2,keepdims=True),1e-6)
encoded=np.rint(np.clip((vectors+1)*127.5,0,255)).astype(np.uint8)
Image.fromarray(encoded).save(runtime/'coastal_scan_normal.webp',lossless=True,quality=100,method=6,exact=True)
Image.open(textures/'coastal_cliff_01_arm_1k.jpg').convert('RGB').resize((512,512),Image.Resampling.LANCZOS).save(runtime/'coastal_scan_arm.webp',quality=94,method=6,exact=True)
for name in ['coastal_scan_color.webp','coastal_scan_normal.webp','coastal_scan_arm.webp']:
    path=runtime/name;blob=path.read_bytes();report['runtime'][name]={'bytes':len(blob),'sha256':sha256(blob).hexdigest(),'size':list(Image.open(path).size)}
report['texture_bytes']=sum(x['bytes'] for x in report['runtime'].values())
report['gpu_rgba8_mip_bytes']=sum(sum(max(1,x['size'][0]//2**i)*max(1,x['size'][1]//2**i)*4 for i in range(int(np.log2(max(x['size'])))+1))for x in report['runtime'].values())
assert report['texture_bytes']<1_100_000
(root/'assets/coastal-scan/source-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
