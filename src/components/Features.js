import { Box, SimpleGrid, Heading, Text, VStack, Container } from '@chakra-ui/react';

// 장점 카드 컴포넌트
function FeatureCard({ icon, title, description }) {
  return (
    <Box 
      bg="white" 
      p={8} 
      borderRadius="lg" 
      boxShadow="md" 
      border="1px solid" 
      borderColor="gray.100"
      textAlign="center"
      _hover={{ transform: "translateY(-5px)", boxShadow: "lg", transition: "all 0.3s" }}
    >
      {/* 아이콘을 텍스트(이모지)로 바로 출력 */}
      <Text fontSize="4xl" mb={4}>{icon}</Text> 
      <Heading size="md" mb={2} color="gray.800">
        {title}
      </Heading>
      <Text color="gray.600">
        {description}
      </Text>
    </Box>
  );
}

function Features() {
  return (
    <Box py={20} bg="white">
      <Container maxW="6xl">
        <VStack spacing={12}>
          <Box textAlign="center">
            <Text color="blue.500" fontWeight="bold" mb={2}>WHY US?</Text>
            <Heading size="xl" color="gray.800">우리 학원만의 특별함</Heading>
          </Box>

          <SimpleGrid columns={{ base: 1, md: 3 }} gap={10} w="full">
            <FeatureCard 
              icon="🎹" 
              title="최고급 시설" 
              description="연습에만 집중할 수 있는 방음 시설과 최신 악기가 완비되어 있습니다." 
            />
            <FeatureCard 
              icon="👩‍🏫" 
              title="1:1 맞춤형 레슨" 
              description="학생 개개인의 수준과 목표에 맞춘 체계적인 개인 레슨을 제공합니다." 
            />
            <FeatureCard 
              icon="🏆" 
              title="입시 성공 실적" 
              description="매년 명문 예고, 음대 합격생을 배출하는 검증된 커리큘럼입니다." 
            />
          </SimpleGrid>
        </VStack>
      </Container>
    </Box>
  );
}

// ⭐ 가장 중요: 반드시 default로 내보내야 함
export default Features;