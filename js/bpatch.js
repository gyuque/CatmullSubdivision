(function(aGlobal) {
	'use strict';

	function BezierPatchModel(sourceData) {
		this.positions  = sourceData.positions;
		this.patches = [];
		this.buildPatches(sourceData.patches);
	}
	
	BezierPatchModel.prototype = {
		getPatchesCount: function() {
			return this.patches.length;
		},
		
		getPatchAt: function(i) {
			return this.patches[i] || null;
		},
		
		buildPatches: function(patches) {
			var len = patches.length;
			for (var i = 0;i < len;i++) {
				this.addPatch(patches[i]);
			}
		},
		
		addPatch: function(indices) {
			var len = indices.length;
			var controlPoints = new Array(len);
			for (var i = 0;i < len;i++) {
				//                          index is 1 based   vv
				controlPoints[i] = this.positions[ indices[i] - 1 ];
			}
			
			var pt = new BezierPatch(controlPoints);
			this.patches.push(pt);
		}
	};

	function BezierPatch(controlPoints) {
		this.controlPoints = new Array(controlPoints.length);
		this.transformedControlPoints = new Array(controlPoints.length);
		for (var i = 0;i < controlPoints.length;i++) {
			var c = controlPoints[i];
			this.controlPoints[i] = new Vec4(c.x, c.y, c.z, 1);
			this.transformedControlPoints[i] = new Vec4();
		}
		
		this.bicubicMs = {
			x: new M44(),
			y: new M44(),
			z: new M44(),
			w: new M44()
		};
	
	}
	
	BezierPatch.makeBezierCoefficientsMatrix = function() {
		var m = new M44();
		
		m._11 = -1; m._12 =  3; m._13 = -3; m._14 = 1;
		m._21 =  3; m._22 = -6; m._23 =  3; m._24 = 0;
		m._31 = -3; m._32 =  3; m._33 =  0; m._34 = 0;
		m._41 =  1; m._42 =  0; m._43 =  0; m._44 = 0;
		return m;
	};
	
	BezierPatch.prototype = {
		generateBicubicSurfaceMatrix: function(component, Mout) {
			var c = this.transformedControlPoints;
			var mP = new M44();
			mP._11  = c[0][component]; mP._12  = c[1][component]; mP._13  = c[2][component]; mP._14  = c[3][component];
			mP._21  = c[4][component]; mP._22  = c[5][component]; mP._23  = c[6][component]; mP._24  = c[7][component];
			mP._31  = c[8][component]; mP._32  = c[9][component]; mP._33 = c[10][component]; mP._34 = c[11][component];
			mP._41 = c[12][component]; mP._42 = c[13][component]; mP._43 = c[14][component]; mP._44 = c[15][component];
			
			var mM1 = BezierPatch.makeBezierCoefficientsMatrix();
			var mM2 = (new M44()).makeTransposed(mM1);
			
			var tmp = new M44();
			tmp.mul(mP, mM2);
			
			Mout.mul(mM1, tmp);
			return Mout;
		},
		
		updateTransform: function(transformMatrix) {
			var CPs = this.controlPoints;
			var TCPs = this.transformedControlPoints;
			var len = CPs.length;
			for (var i = 0;i < len;i++) {
				var c = CPs[i];
				transformMatrix.transVec3(TCPs[i], c.x, c.y, c.z);
			}
			
			this.generateBicubicSurfaceMatrix('x', this.bicubicMs.x);
			this.generateBicubicSurfaceMatrix('y', this.bicubicMs.y);
			this.generateBicubicSurfaceMatrix('z', this.bicubicMs.z);
			this.generateBicubicSurfaceMatrix('w', this.bicubicMs.w);
		},
		
		calcPointOnSurface: function(u, v, component) {
			if(!tmpV4) {tmpV4 = new Vec4();}
			
			var M = this.bicubicMs[component];
			M.transVec4(tmpV4, v*v*v, v*v, v, 1);
			
			return tmpV4.x * (u*u*u)  +  tmpV4.y * (u*u)  + tmpV4.z * u  +  tmpV4.w;
		}
	};

	var tmpV4 = null;

	aGlobal.BezierPatchModel = BezierPatchModel;
	aGlobal.BezierPatch = BezierPatch;
})(window);