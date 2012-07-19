(function(aGlobal) {
	'use strict';
	var theViewer = null;
	var theModel = null;
	
	var OVER_SAMPLING = 2;
	var FBWIDTH = 512;
	var FBHEIGHT = 512;
	var gFrameBuffer = null;
	
	var gViewStatus = {
		rY: 0,
		rX: -0.9
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
		document.getElementById("render-trigger").addEventListener("click", onRenderButtonClick, false);
	};
	
	function onMouseMove(e) {
		gViewStatus.rY = e.clientX * 0.01;
		redrawPreview();
	}
	
	function onRenderButtonClick(e) {
		var subd = new SubdivisionContext(theModel, theViewer, gFrameBuffer);
		
		subd.traverse();
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
		var M = makeViewMatrix(gViewStatus.rX, gViewStatus.rY);
		theViewer.viewMatrix.copyFrom(M);
		theViewer.updateTransforms();
		theViewer.drawPreview(theModel);
	}
	
	var makeViewMatrix = (function() {
		var m1 = new M44();
		var m2 = new M44();
		var m3 = new M44();
		
		return function(rX, rY) {
			m1.rotationY(rY);
			m2.rotationX(rX);
			m3.mul(m1, m2);

			m1.translate(0, -1, -9);
			m2.mul(m1, m3);

			return m2;
		};
	})();
	
})(window);