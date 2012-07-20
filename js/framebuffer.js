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