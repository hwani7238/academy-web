import { Box, Heading, Text, Button, VStack, Container } from '@chakra-ui/react';

function Hero() {
  return (
    <Box bg="blue.50" py={20}>
      <Container maxW="4xl" textAlign="center">
        <VStack spacing={6}>
          <Heading as="h1" size="2xl" fontWeight="bold" color="blue.800">
            꿈을 현실로 만드는 <br />
            <Text as="span" color="blue.500">위 뮤직 아카데미</Text>
          </Heading>
          
          <Text fontSize="xl" color="gray.600">
            체계적인 커리큘럼과 최고의 강사진이 여러분을 기다립니다. <br />
            지금 바로 당신의 잠재력을 깨워보세요.
          </Text>

          {/* colorPalette 대신 기본적인 색상 스타일 적용 */}
          <Button 
            size="lg" 
            colorScheme="blue"
            bg="blue.500"
            color="white"
            px={8}
            py={6}
            fontSize="lg"
            fontWeight="bold"
            borderRadius="full"
            _hover={{ bg: "blue.600" }}
          >
            무료 상담 신청하기 👉
          </Button>
        </VStack>
      </Container>
    </Box>
  );
}

// ⭐ 가장 중요: 반드시 default로 내보내야 함
export default Hero;