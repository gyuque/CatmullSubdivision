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
		
		setPixel: function(x, y, r, g, b) {
			y <<= 0;
			var pos = (this.width << 2) * y + (x << 2);
			this.colorBuffer[pos++] = r;
			this.colorBuffer[pos++] = g;
			this.colorBuffer[pos  ] = b;
		},
		
		emit1x: function(g) {
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