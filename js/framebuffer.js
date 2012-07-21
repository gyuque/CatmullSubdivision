/*
Copyright (c) 2012 Satoshi Ueyama

Permission is hereby granted, free of charge, to any person obtaining a copy of this 
software and associated documentation files (the "Software"), to deal in the Software 
without restriction, including without limitation the rights to use, copy, modify, merge, 
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

(function(aGlobal) {
	'use strict';
	
	function FrameBuffer(w, h) {
		this.width = w;
		this.height = h;
		this.allocate();
	}
	
	FrameBuffer.prototype = {
		allocate: function() {
			this.colorBuffer = new Uint8Array(4 * this.width * this.height);
			this.zBuffer = new Float32Array(this.width * this.height);
		},
		
		clearZBuffer: function(z) {
			var b = this.zBuffer;
			var len = this.width * this.height;
			for (var i = 0;i < len;i++) {
				b[i] = z;
			}
		},
		
		clearColorBuffer: function(r, g, b) {
			var b = this.colorBuffer;
			var len = this.width * this.height;
			var pos = 0;
			for (var i = 0;i < len;i++) {
				b[pos++] = r;
				b[pos++] = g;
				b[pos++] = b;
				++pos;
			}			
		},
		
		setPixel: function(x, y, z, r, g, b) {
			var w = this.width;
			var h = this.height;
			if (x < 0 || y < 0 || x >= w || y >= h) {return;}
			
			var zpos = w * y + x;
			var zb = this.zBuffer;
			if (zb[zpos] < z) {return;}
			zb[zpos] = z;
			
			y <<= 0;
			var pos = zpos << 2;
			var cb = this.colorBuffer;
			cb[pos++] = r;
			cb[pos++] = g;
			cb[pos  ] = b;
		},
		
		emitToCanvas: function(g) {
			var w = this.width;
			var h = this.height;
			var imageData = g.getImageData(0, 0, w, h);
			var pixs = imageData.data;
			var src = this.colorBuffer;
			
			var pos = 0;
			for (var y = 0;y < h;y++) {
				for (var x = 0;x < w;x++) {
					pixs[pos] = src[pos++];
					pixs[pos] = src[pos++];
					pixs[pos] = src[pos++];
					pixs[pos++] = 255;
				}
			}
			
			g.putImageData(imageData, 0, 0);
		}
	};
	
	aGlobal.FrameBuffer = FrameBuffer;
})(window);