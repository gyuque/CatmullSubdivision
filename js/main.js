/*
Demonstration of Catmull's Subdivision Based Rendering
-------------------------------------------------------
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
	var theViewer = null;
	var theModel = null;
	
	var OVER_SAMPLING = 1;
	var FBWIDTH = 512;
	var FBHEIGHT = 512;
	var gFrameBuffer = null;
	var gRenderButton = null;
	var gBusy = false;
	var gStatusArea;
	
	var gViewStatus = {
		rY: 0,
		rX: -0.4
	};

	aGlobal.launch = function() {
		gStatusArea = document.getElementById("status-area");
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
			var ox = theViewer.canvas.offsetLeft + theViewer.canvas.parentNode.offsetLeft;
			gViewStatus.rY = (e.clientX - ox) * 0.02 - 0.1;
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
			gStatusArea.innerHTML = getNodeGenerateCount()+" patches generated";
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