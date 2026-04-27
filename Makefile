local:
	sam build --cached --parallel
	sam local start-api --skip-pull-image --warm-containers LAZY
