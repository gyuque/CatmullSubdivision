(function(aGlobal) {
	'use strict';

	function Viewer(canvas) {
		this.projectionMatrix = new M44();
		this.viewMatrix = new M44();
		this.viewProjectionMatrix = new M44();
		this.width = 1;
		this.height = 1;
		
		this.canvas = canvas;
		this.g = canvas.getContext("2d");
		this._tempVec4 = new Vec4();
		
		this.markerPoss = [
			new Vec4(-5, 5, 0, 1), new Vec4( 0, 5, 0, 1), new Vec4( 5, 5, 0, 1),
			new Vec4(-5, 0, 0, 1), new Vec4( 0, 0, 0, 1), new Vec4( 5, 0, 0, 1),
			new Vec4(-5,-5, 0, 1), new Vec4( 0,-5, 0, 1), new Vec4( 5,-5, 0, 1)
		];
	}

	Viewer.prototype = {
		setCanvasSize: function(w, h) {
			this.canvas.width  = w;
			this.canvas.height = h;

			this.width = w;
			this.height = h;
		},
		
		drawPreview: function(previewModel) {
			var g = this.g;
			g.clearRect(0, 0, this.width, this.height);
			g.fillStyle = "#000";
			g.fillRect(0, 0, this.width, this.height);
			
			this.drawMarker();
			if (previewModel) {
				this.drawSparseSamplingPreview(previewModel);
				this.drawModelPreview(previewModel);
			}
		},

		drawSparseSamplingPreview: function(model) {
			var n = model.getPatchesCount();
			for (var i = 0;i < n;i++) {
				var patch = model.getPatchAt(i);
				patch.updateTransform(this.viewProjectionMatrix);
				this.drawSparseSampledPoints(patch, i == 5);
			}
		},
		
		drawSparseSampledPoints: function(patch, em) {
			var V = this._tempVec4;
			var Ms = patch.bicubicMs;
			var g = this.g;
			g.fillStyle = em ? "#4ff" : "#999";

			var cw = this.width / 2;
			var ch = this.height / 2;

			var DIVS = 6;
			for (var y = 0;y <= DIVS;y++) {
				for (var x = 0;x <= DIVS;x++) {
					var u = x / DIVS;
					var v = y / DIVS;
					V.x = patch.calcPointOnSurface(u, v, 'x');
					V.y = patch.calcPointOnSurface(u, v, 'y');
					V.z = patch.calcPointOnSurface(u, v, 'z');
					V.w = patch.calcPointOnSurface(u, v, 'w');
					
					var sx = V.x / V.w;
					var sy = V.y / V.w;
					sx = sx *  cw + cw;
					sy = sy * -ch + ch;
					
					this.g.fillRect(sx, sy, 1, 1);
				}
			}
		},
		
		drawModelPreview: function(model) {
			var g = this.g;
			g.fillStyle = "#ff0";
			g.strokeStyle = "#880";
			var n = model.getPatchesCount();
			for (var i = 0;i < n;i++) {
				var patch = model.getPatchAt(i);
				var CPs = patch.controlPoints;
				var clen = CPs.length;
				for (var j = 0;j < clen;j++) {
					var em = (j<4) || (j >= 12) || 0 == (j%4) || 3 == (j%4);
					this.drawPoint(CPs[j], em);
				}
				
				g.beginPath(); this.draw3DLine(CPs[0], CPs[1]); g.stroke();
				g.beginPath(); this.draw3DLine(CPs[1], CPs[2]); g.stroke();
				g.beginPath(); this.draw3DLine(CPs[2], CPs[3]); g.stroke();

				g.beginPath(); this.draw3DLine(CPs[0],  CPs[4]); g.stroke();
				g.beginPath(); this.draw3DLine(CPs[4],  CPs[8]); g.stroke();
				g.beginPath(); this.draw3DLine(CPs[8], CPs[12]); g.stroke();

				g.beginPath(); this.draw3DLine(CPs[12], CPs[13]); g.stroke();
				g.beginPath(); this.draw3DLine(CPs[13], CPs[14]); g.stroke();
				g.beginPath(); this.draw3DLine(CPs[14], CPs[15]); g.stroke();

				g.beginPath(); this.draw3DLine( CPs[3],  CPs[7]); g.stroke();
				g.beginPath(); this.draw3DLine( CPs[7], CPs[11]); g.stroke();
				g.beginPath(); this.draw3DLine(CPs[11], CPs[15]); g.stroke();
			}
		},
		
		drawPoint: function(pos, em) {
			var spos = this.transformToScreenCoord(pos);
			if (em)
				this.g.fillRect(spos.x - 1, spos.y - 1 , 3, 3);
			else
				this.g.fillRect(spos.x, spos.y, 1, 1);
		},
		
		drawMarker: function() {
			var g = this.g;
			var p = this.markerPoss;
			g.strokeStyle = "#080";
			g.lineWidth = 1;
			
			g.beginPath(); this.draw3DLine(p[0], p[2]); g.stroke();
			g.beginPath(); this.draw3DLine(p[2], p[8]); g.stroke();
			g.beginPath(); this.draw3DLine(p[8], p[6]); g.stroke();
			g.beginPath(); this.draw3DLine(p[6], p[0]); g.stroke();

			g.strokeStyle = "#0f0";
			g.beginPath(); this.draw3DLine(p[3], p[5]); g.stroke();
			g.beginPath(); this.draw3DLine(p[1], p[7]); g.stroke();
		},
		
		draw3DLine: function(v1, v2) {
			var spos;
			spos = this.transformToScreenCoord(v1);
			this.g.moveTo(spos.x, spos.y);

			spos = this.transformToScreenCoord(v2);
			this.g.lineTo(spos.x, spos.y);
			
		},
		
		updateTransforms: function() {
			this.viewProjectionMatrix.mul(this.projectionMatrix, this.viewMatrix);
		},
		
		transformToScreenCoord: function(pos) {
			var v = this._tempVec4;
			this.viewProjectionMatrix.transVec3(v, pos.x, pos.y, pos.z);
			
			v.x /= v.w;
			v.y /= v.w;
			v.z /= v.w;
			var cw = this.width / 2;
			var ch = this.height / 2;
			v.x = v.x *  cw + cw;
			v.y = v.y * -ch + ch;
			
			return v;
		}
	};


	aGlobal.Viewer = Viewer;
})(window);