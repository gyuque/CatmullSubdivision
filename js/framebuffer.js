(function(aGlobal) {
	'use strict';
	
	function FrameBuffer(w, h) {
		this.width = w;
		this.height = h;
		this.allocate();
	}
	
	FrameBuffer.prototype = {
		allocate: function() {
			this.colorBuffer = new Int8Array(4 * this.width * this.height);
			this.zBuffer = new Float32Array(this.width * this.height);
		}
	};
	
	aGlobal.FrameBuffer = FrameBuffer;
})(window);