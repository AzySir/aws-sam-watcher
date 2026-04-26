local:
	sam build
	sam local start-api --skip-pull-image --warm-containers LAZY
