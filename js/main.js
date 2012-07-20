(function(aGlobal) {
	'use strict';
	var theViewer = null;
	var theModel = null;
	
	var OVER_SAMPLING = 1;
	var FBWIDTH = 512;
	var FBHEIGHT = 512;
	var gFrameBuffer = null;
	var gRenderButton = null;
	var gBusy = false;
	
	var gViewStatus = {
		rY: 0,
		rX: -0.4
	};

	aGlobal.launch = function() {
		console.log("tt");
		gFrameBuffer = new FrameBuffer(FBWIDTH * OVER_SAMPLING, FBHEIGHT * OVER_SAMPLING);
		theModel = new BezierPatchModel(BEZIER_PATCHES);
		theViewer = new Viewer( document.getElementById("cv") );
		
		theViewer.setCanvasSize(FBWIDTH, FBHEIGHT);
		theViewer.projectionMatrix.perspectiveFOV(Math.PI/3.0, FBWIDTH / FBHEIGHT, 1, 100);
		theViewer.canvas.addEventListener("mousemove", onMouseMove, false);
		
		redrawPreview();
		gRenderButton = document.getElementById("render-trigger");
		gRenderButton.addEventListener("click", onRenderButtonClick, false);
	};
	
	function onMouseMove(e) {
		if (!ActionButton.clearMode && !gBusy) {
			gViewStatus.rY = e.clientX * 0.02 - 0.1;
			redrawPreview();
		}
	}
	
	var ActionButton = {
		clearMode: false,
		setRender: function() {
			gRenderButton.innerHTML = "Render";
			gRenderButton.disabled = false;
			this.clearMode = false;
		},

		setClear: function() {
			gRenderButton.innerHTML = "Clear";
			gRenderButton.disabled = false;
			this.clearMode = true;
		},
		
		setDisabled: function() {
			gRenderButton.innerHTML = "Wait...";
			gRenderButton.disabled = true;
		}
	};

	function onRenderButtonClick(e) {
		if (ActionButton.clearMode) {
			ActionButton.setRender();
			redrawPreview();
		} else {
			startRendering();
		}
	}
	
	function startRendering() {
		ActionButton.setDisabled();
		
		clearSubdivisionNodes();
		var subd = new SubdivisionContext(theModel, theViewer, gFrameBuffer);
		var tickCount = 0;
				
		function tick() {
			var needMore = subd.traverse();
			gFrameBuffer.emitToCanvas(theViewer.g);
			if (needMore && ++tickCount < 1000) {
				setTimeout(tick, 1);
			} else {
				gBusy = false;
				ActionButton.setClear();
			}
		}
		
		gFrameBuffer.clearColorBuffer(0, 0, 0);
		gFrameBuffer.clearZBuffer(1);
		gBusy = true;
		setTimeout(tick, 1);

		/*
		console.log("transform: " + JSON.stringify(theViewer.viewProjectionMatrix));
		var Ms = subd.surfaces[5].coefficientsMatricies;
		console.log("x: " + JSON.stringify(Ms.x));
		console.log("y: " + JSON.stringify(Ms.y));
		console.log("z: " + JSON.stringify(Ms.z));
		console.log("w: " + JSON.stringify(Ms.w));
		*/
	}
	
	function redrawPreview() {
		var M = makeViewMatrix(gViewStatus.rX - gViewStatus.rY*0.2, gViewStatus.rY);
		theViewer.viewMatrix.copyFrom(M);
		theViewer.updateTransforms();
		theViewer.drawPreview(theModel);
	}
	
	var makeViewMatrix = (function() {
		var m1 = new M44();
		var m2 = new M44();
		var m3 = new M44();
		
		return function(rX, rZ) {
			m1.rotationX(rX);
			m2.rotationZ(rZ);
			m3.mul(m1, m2);

			m1.translate(0, -1, -7.5 + rZ*0.2);
			m2.mul(m1, m3);

			return m2;
		};
	})();
	
})(window);